// Grup "table" (Main Daily Ticket Table + status/validasi counters) untuk
// domain Daily Ticket — dipisah dari daily-ticket.service.ts (yang tadinya
// 3521 baris) semata untuk memecah unit kompilasi jadi lebih kecil. Method
// `static`/`private` di class asli jadi fungsi biasa di sini (pemanggilan
// `this.xxx()` jadi `xxx()` langsung); tidak ada perubahan logic.

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { DASHBOARD_CACHE_TTL, getOrSetCacheSwr } from '@/lib/cache';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';
import { toWibDateString, todayWibDateForDb } from '@/lib/timezone';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import {
  type TicketFilters,
  type TicketTypeOption,
  type CustomerTypeSummary,
  type FlaggingSummary,
  buildSqlWhereClause,
  splitDailyFilterUnion,
  buildStatusCategorySql,
  summarizeBucketRows,
  mapTicket,
  hydrateTicketsByIds,
  queryRawWithOptionalIndex,
  normalizeCacheFilterValue,
  parseCountValue,
} from './daily-ticket-helpers';
import {
  buildDailyTicketWhere,
  buildMainTableWhere,
  buildValidasiBaseWhere,
  fetchTicketIdsBySql,
} from './daily-ticket-where';

function withAdditionalWhere(
  where: Prisma.ticketWhereInput,
  ...clauses: Prisma.ticketWhereInput[]
): Prisma.ticketWhereInput {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) return where;
  return {
    AND: [where, ...activeClauses],
  };
}

async function countValidasiTickets(
  validasiBaseWhere: Prisma.ticketWhereInput,
): Promise<number> {
  const [whereClause, params] = buildSqlWhereClause(validasiBaseWhere);
  const sql = `
    SELECT /*+ MAX_EXECUTION_TIME(30000) */ COUNT(*) AS total
    FROM ticket
    WHERE ${whereClause}
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(sql, ...params);

  return Number(rows[0]?.total ?? 0);
}

function normalizeFlaggingSummary(row?: Record<string, unknown>): FlaggingSummary {
  return {
    ffgCount: Number(row?.ffg ?? 0),
    gamasCount: Number(row?.gamas ?? 0),
    p1Count: Number(row?.p1 ?? 0),
    pPlusCount: Number(row?.p_plus ?? 0),
  };
}

async function countValidasiFlaggingSummary(
  validasiBaseWhere: Prisma.ticketWhereInput,
): Promise<Array<Record<string, unknown>>> {
  const [sql, params] = buildSqlWhereClause(validasiBaseWhere);
  const sqlWithIndex = `
    SELECT /*+ MAX_EXECUTION_TIME(30000) */
      t.id_ticket,
      t.status,
      t.status_update,
      t.guarantee_status,
      t.ticket_id_gamas,
      t.flagging_manja,
      t.booking_date
    FROM ticket t
    WHERE ${sql}
  `;
  const sqlWithoutIndex = `
    SELECT
      t.id_ticket,
      t.status,
      t.status_update,
      t.guarantee_status,
      t.ticket_id_gamas,
      t.flagging_manja,
      t.booking_date
    FROM ticket t
    WHERE ${sql}
  `;

  return queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
    sqlWithIndex,
    sqlWithoutIndex,
    params,
  );
}

async function countFlaggingSummary(
  mainTableWhere: Prisma.ticketWhereInput,
  validasiBaseWhere?: Prisma.ticketWhereInput | null,
): Promise<FlaggingSummary> {
  const union = splitDailyFilterUnion(mainTableWhere);

  let mainSql: string;
  let mainParams: any[];
  if (union) {
    const [s1, s2] = union.branchSqls;
    const [p1, p2] = union.params;
    mainSql = `
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ id_ticket, status, status_update, guarantee_status, ticket_id_gamas, flagging_manja, booking_date
      FROM ticket WHERE ${s1}
      UNION ALL
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ id_ticket, status, status_update, guarantee_status, ticket_id_gamas, flagging_manja, booking_date
      FROM ticket WHERE ${s2}
    `;
    mainParams = [...p1, ...p2];
  } else {
    const [wc, ps] = buildSqlWhereClause(mainTableWhere);
    mainSql = `
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ id_ticket, status, status_update, guarantee_status, ticket_id_gamas, flagging_manja, booking_date
      FROM ticket
      WHERE ${wc}
    `;
    mainParams = ps;
  }

  const mainWithIndex = mainSql;
  const mainWithoutIndex = mainSql;

  const [mainRows, validasiRows] = await Promise.all([
    queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
      mainWithIndex,
      mainWithoutIndex,
      mainParams,
    ),
    validasiBaseWhere
      ? countValidasiFlaggingSummary(validasiBaseWhere)
      : Promise.resolve([] as Array<Record<string, unknown>>),
  ]);

  const seen = new Set<number>();
  const allRows: Array<Record<string, unknown>> = [];
  for (const row of [...mainRows, ...validasiRows]) {
    const id = Number(row.id_ticket);
    if (!seen.has(id)) {
      seen.add(id);
      allRows.push(row);
    }
  }

  return summarizeBucketRows(allRows as Array<{
    status: string | null;
    status_update: string | null;
    guarantee_status: string | null;
    ticket_id_gamas: string | null;
    flagging_manja: string | null;
    booking_date: string | null;
  }>);
}

async function fetchValidasiTicketIds(
  validasiBaseWhere: Prisma.ticketWhereInput,
  options: { sort: 'asc' | 'desc'; offset: number; limit: number; cursor?: string | null },
): Promise<{ ids: number[]; nextCursor: string | null }> {
  const [whereClause, params] = buildSqlWhereClause(validasiBaseWhere);
  const sortDirection = options.sort === 'asc' ? 'ASC' : 'DESC';
  const cursor = options.cursor;

  let sql: string;
  let queryParams: any[];
  let nextCursor: string | null = null;

  if (cursor) {
    const cursorDirection = sortDirection === 'ASC' ? '>' : '<';
    sql = `
      SELECT id_ticket, reported_date
      FROM ticket
      WHERE ${whereClause}
        AND reported_date ${cursorDirection} ?
      ORDER BY reported_date ${sortDirection}, id_ticket ASC
      LIMIT ?
    `;
    queryParams = [...params, cursor, options.limit];
  } else {
    sql = `
      SELECT id_ticket, reported_date
      FROM ticket
      WHERE ${whereClause}
      ORDER BY reported_date ${sortDirection}, id_ticket ASC
      LIMIT ?, ?
    `;
    queryParams = [...params, options.offset, options.limit];
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ id_ticket: number; reported_date?: string | Date }>>(
    withMaxExecutionTime(sql),
    ...queryParams,
  );

  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (lastRow.reported_date) {
      nextCursor = lastRow.reported_date instanceof Date
        ? lastRow.reported_date.toISOString()
        : String(lastRow.reported_date);
    }
  }

  return { ids: rows.map((row) => row.id_ticket), nextCursor };
}

async function countStatusesAndCustomerTypes(
  where: Record<string, any>,
): Promise<{ summary: Record<string, number>; customerTypeSummary: CustomerTypeSummary }> {
  const union = splitDailyFilterUnion(where);
  const statusCat = buildStatusCategorySql();

  let sql: string;
  let params: any[];
  if (union) {
    const [s1, s2] = union.branchSqls;
    const [p1, p2] = union.params;
    const aggSelect = `
      COUNT(*) AS total,
      SUM(CASE WHEN ${statusCat} = 'open' THEN 1 ELSE 0 END) AS \`open\`,
      SUM(CASE WHEN ${statusCat} = 'assigned' THEN 1 ELSE 0 END) AS assigned,
      SUM(CASE WHEN ${statusCat} = 'on_progress' THEN 1 ELSE 0 END) AS on_progress,
      SUM(CASE WHEN ${statusCat} = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN ${statusCat} = 'close' THEN 1 ELSE 0 END) AS \`close\`,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_diamond', 'hvc diamond', 'diamond') THEN 1 ELSE 0 END) AS hvc_diamond,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_platinum', 'hvc platinum', 'platinum') THEN 1 ELSE 0 END) AS hvc_platinum,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_gold', 'hvc gold', 'gold') THEN 1 ELSE 0 END) AS hvc_gold,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('reguler', 'regular') THEN 1 ELSE 0 END) AS reguler
    `;
    sql = `
      SELECT
        SUM(total) AS total,
        SUM(\`open\`) AS \`open\`,
        SUM(assigned) AS assigned,
        SUM(on_progress) AS on_progress,
        SUM(pending) AS pending,
        SUM(\`close\`) AS \`close\`,
        SUM(hvc_diamond) AS hvc_diamond,
        SUM(hvc_platinum) AS hvc_platinum,
        SUM(hvc_gold) AS hvc_gold,
        SUM(reguler) AS reguler
      FROM (
        SELECT /*+ MAX_EXECUTION_TIME(30000) */ ${aggSelect}
        FROM ticket WHERE ${s1}
        UNION ALL
        SELECT /*+ MAX_EXECUTION_TIME(30000) */ ${aggSelect}
        FROM ticket WHERE ${s2}
      ) AS combined
    `;
    params = [...p1, ...p2];
  } else {
    const [wc, ps] = buildSqlWhereClause(where);
    sql = `
      SELECT /*+ MAX_EXECUTION_TIME(30000) */
        COUNT(*) AS total,
        SUM(CASE WHEN ${statusCat} = 'open' THEN 1 ELSE 0 END) AS \`open\`,
        SUM(CASE WHEN ${statusCat} = 'assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN ${statusCat} = 'on_progress' THEN 1 ELSE 0 END) AS on_progress,
        SUM(CASE WHEN ${statusCat} = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN ${statusCat} = 'close' THEN 1 ELSE 0 END) AS \`close\`,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_diamond', 'hvc diamond', 'diamond') THEN 1 ELSE 0 END) AS hvc_diamond,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_platinum', 'hvc platinum', 'platinum') THEN 1 ELSE 0 END) AS hvc_platinum,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_gold', 'hvc gold', 'gold') THEN 1 ELSE 0 END) AS hvc_gold,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('reguler', 'regular') THEN 1 ELSE 0 END) AS reguler
      FROM ticket
      WHERE ${wc}
    `;
    params = ps;
  }

  const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);

  const summary: Record<string, number> = {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    assigned: Number(row?.assigned ?? 0),
    onProgress: Number(row?.on_progress ?? 0),
    pending: Number(row?.pending ?? 0),
    close: Number(row?.close ?? 0),
    unassigned: Number(row?.open ?? 0),
  };

  const customerTypeSummary: CustomerTypeSummary = {
    hvcDiamond: Number(row?.hvc_diamond ?? 0),
    hvcPlatinum: Number(row?.hvc_platinum ?? 0),
    hvcGold: Number(row?.hvc_gold ?? 0),
    reguler: Number(row?.reguler ?? 0),
  };

  return { summary, customerTypeSummary };
}

function extractWorkzonesFromWhere(where: Record<string, any>): string[] | null {
  if (where.workzone && typeof where.workzone === 'string') return [where.workzone];
  if (where.workzone?.in && Array.isArray(where.workzone.in)) {
    return where.workzone.in.filter((w: unknown): w is string => typeof w === 'string');
  }
  if (where.AND && Array.isArray(where.AND)) {
    for (const branch of where.AND) {
      if (typeof branch === 'object' && branch !== null) {
        const result = extractWorkzonesFromWhere(branch);
        if (result) return result;
      }
    }
  }
  return null;
}

async function trySnapshotForSummary(
  mainTableWhere: Record<string, any>,
): Promise<{
  summary: Record<string, number>;
  customerTypeSummary: CustomerTypeSummary;
  flaggingSummary: FlaggingSummary;
} | null> {
  try {
    const workzones = extractWorkzonesFromWhere(mainTableWhere);
    if (!workzones || workzones.length === 0) return null;

    const todayStr = toWibDateString(new Date());
    if (!todayStr) return null;
    const todayStart = new Date(todayStr + 'T00:00:00.000Z');

    const rows = await prisma.dashboardSummarySnapshot.findMany({
      where: {
        aggDate: todayStart,
        workzone: { in: workzones },
      },
    });

    if (rows.length === 0) return null;

    const summary = { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0, unassigned: 0 };
    const customerTypeSummary: CustomerTypeSummary = { hvcDiamond: 0, hvcPlatinum: 0, hvcGold: 0, reguler: 0 };
    const flaggingSummary: FlaggingSummary = { ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 };

    for (const row of rows) {
      summary.total += row.total;
      summary.open += row.open;
      summary.assigned += row.assigned;
      summary.onProgress += row.onProgress;
      summary.pending += row.pending;
      summary.close += row.close;
      customerTypeSummary.hvcDiamond += row.hvcDiamond;
      customerTypeSummary.hvcPlatinum += row.hvcPlatinum;
      customerTypeSummary.hvcGold += row.hvcGold;
      customerTypeSummary.reguler += row.reguler;
      flaggingSummary.ffgCount += row.ffgCount;
      flaggingSummary.gamasCount += row.gamasCount;
      flaggingSummary.p1Count += row.p1Count;
      flaggingSummary.pPlusCount += row.pPlusCount;
    }
    summary.unassigned = summary.open;

    return { summary, customerTypeSummary, flaggingSummary };
  } catch {
    return null;
  }
}

/**
 * Optimized Status Counter
 *
 * Replaces 6 COUNT queries
 */

export async function countStatuses(where: Record<string, any>) {
  const union = splitDailyFilterUnion(where);

  let sql: string;
  let params: any[];
  if (union) {
    const [s1, s2] = union.branchSqls;
    const [p1, p2] = union.params;
    sql = `
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ status, status_update, SUM(cnt) AS count
      FROM (
        SELECT status, status_update, COUNT(*) AS cnt FROM ticket WHERE ${s1} GROUP BY status, status_update
        UNION ALL
        SELECT status, status_update, COUNT(*) AS cnt FROM ticket WHERE ${s2} GROUP BY status, status_update
      ) AS daily_statuses
      GROUP BY status, status_update
    `;
    params = [...p1, ...p2];
  } else {
    const [wc, ps] = buildSqlWhereClause(where);
    sql = `
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ status, status_update, COUNT(*) AS count
      FROM ticket
      WHERE ${wc}
      GROUP BY status, status_update
    `;
    params = ps;
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{ status: string | null; status_update: string | null; count: bigint | number }>
  >(sql, ...params);

  const stats: any = {
    total: 0,
    open: 0,
    assigned: 0,
    onProgress: 0,
    pending: 0,
    close: 0,
  };

  for (const row of rows) {
    const count = Number(row.count);
    stats.total += count;

    const statusVal = (row.status ?? '').trim().toUpperCase();
    const su = (row.status_update ?? '').trim().toLowerCase();

    if (CLOSE_STATUS_VALUES.includes(statusVal)) {
      stats.close += count;
    } else if (su === 'assigned') {
      stats.assigned += count;
    } else if (su === 'on_progress') {
      stats.onProgress += count;
    } else if (su === 'pending') {
      stats.pending += count;
    } else {
      stats.open += count;
    }
  }

  stats.unassigned = stats.open;

  return stats;
}

export async function getTicketStatusOptions(
  where: Prisma.ticketWhereInput,
): Promise<string[]> {
  const rows = await prisma.ticket.findMany({
    where,
    distinct: ['status'],
    select: { status: true },
    orderBy: { status: 'asc' },
  });

  return rows
    .map((row) => String(row.status ?? '').trim())
    .filter((status, index, arr) => status.length > 0 && arr.indexOf(status) === index);
}

export async function getTicketTypeOptions(
  where: Prisma.ticketWhereInput,
  validasiBaseWhere?: Prisma.ticketWhereInput | null,
): Promise<TicketTypeOption[]> {
  const rows = await prisma.ticket.groupBy({
    by: ['jenis_tiket_2', 'status_update'],
    where,
    _count: { _all: true },
  });

  const validasiRows = validasiBaseWhere
    ? await prisma.ticket.groupBy({
        by: ['jenis_tiket_2'],
        where: validasiBaseWhere,
        _count: { _all: true },
      })
    : [];

  const grouped = new Map<string, TicketTypeOption>();

  const ensure = (rawJenis: unknown) => {
    const jenis = String(rawJenis ?? '').trim();
    const key = jenis.length > 0 ? jenis : '__blank__';
    const label = jenis.length > 0 ? jenis : 'Blank';
    const current = grouped.get(key);
    if (current) return current;

    const next = { key, label, total: 0, open: 0, assigned: 0, close: 0 };
    grouped.set(key, next);
    return next;
  };

  for (const row of rows) {
    const item = ensure(row.jenis_tiket_2);
    const count = row._count._all;
    const status = String(row.status_update ?? '').trim().toLowerCase();

    item.total += count;
    if (status.length === 0 || status === 'open') item.open += count;
    if (
      status === 'assigned' ||
      status === 'on_progress' ||
      status === 'pending'
    ) {
      item.assigned += count;
    }
    if (status === 'close') item.close += count;
  }

  for (const row of validasiRows) {
    const item = ensure(row.jenis_tiket_2);
    const count = row._count._all;
    item.total += count;
    item.close += count;
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.key === '__blank__') return 1;
    if (b.key === '__blank__') return -1;
    return b.total - a.total || a.label.localeCompare(b.label);
  });
}

/**
 * Main Daily Ticket Table.
 * Pagination must happen in MySQL so a dashboard request never loads the
 * whole daily board into the Node.js heap.
 */

export async function getDailyTicketTable(
  role: string,
  userId: number,
  filters?: TicketFilters,
) {
  // Concurrency limiter: max 3 simultaneous heavy queries per wave
  // Prevents a single dashboard request from exhausting the connection pool
  const MAX_CONCURRENT = 3;
  async function limitedPromiseAll<F extends Array<() => Promise<any>>>(
    promises: F
  ): Promise<{ [K in keyof F]: Awaited<ReturnType<F[K]>> }> {
    const results: any[] = new Array(promises.length);
    const executing: Promise<void>[] = [];
    for (let i = 0; i < promises.length; i++) {
      const promiseFn = promises[i];
      const p = promiseFn().then((result) => {
        results[i] = result;
      });
      executing.push(p);
      if (executing.length >= MAX_CONCURRENT) {
        await Promise.race(executing);
        const idx = executing.findIndex((ep) => ep === p);
        if (idx >= 0) executing.splice(idx, 1);
      }
    }
    await Promise.all(executing);
    return results as { [K in keyof F]: Awaited<ReturnType<F[K]>> };
  }

  const { page = 1, limit = 10, sort = 'desc', sortField, cursor } = filters ?? {};
  const includeValidasi = filters?.includeValidasi !== false;
  const includeValidasiTickets = filters?.includeValidasiTickets !== false;
  const includeSummary = filters?.includeSummary !== false;
  const includeOptions = filters?.includeOptions !== false;
  const includeClosed = filters?.includeClosed === true;
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(250, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const safeValidasiPage = Math.max(
    1,
    Math.floor(filters?.validasiPage ?? safePage),
  );
  const safeValidasiLimit = Math.min(
    250,
    Math.max(1, Math.floor(filters?.validasiLimit ?? safeLimit)),
  );
  const validasiOffset = (safeValidasiPage - 1) * safeValidasiLimit;

  const hasExcludeSymptom = Boolean(filters?.excludeSymptom);
  const validasiWhere = hasExcludeSymptom
    ? await buildDailyTicketWhere(role, userId, {
        ...filters,
        excludeSymptom: undefined,
      })
    : null;
  const where = await buildDailyTicketWhere(role, userId, filters);
  const statusOptionsWhere = includeOptions
    ? await buildDailyTicketWhere(role, userId, {
        ...filters,
        ticketStatus: undefined,
      })
    : null;
  const ticketTypeOptionsWhere = includeOptions
    ? await buildDailyTicketWhere(role, userId, {
        ...filters,
        ticketType: undefined,
      })
    : null;

  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed,
  });
  const validasiBaseWhere = includeValidasi
    ? buildValidasiBaseWhere(validasiWhere ?? where)
    : null;
  const countOnly = filters?.countOnly === true;
  const ticketIdsPromise = countOnly
    ? Promise.resolve({ rows: [] as Array<{ id_ticket: number; rank_global: number }>, nextCursor: null })
    : fetchTicketIdsBySql(mainTableWhere, {
        sort,
        sortField: sortField && sortField !== 'priority' ? sortField : undefined,
        offset,
        limit: safeLimit,
        priorityToday: toWibDateString(todayWibDateForDb()),
        cursor,
      });
  const validasiTicketIdsPromise: Promise<{ ids: number[]; nextCursor: string | null }> = (
    !countOnly && includeValidasi && includeValidasiTickets && validasiBaseWhere
      ? fetchValidasiTicketIds(validasiBaseWhere, {
          sort,
          offset: validasiOffset,
          limit: safeValidasiLimit,
          cursor,
        })
      : Promise.resolve({ ids: [], nextCursor: null })
  ).catch(() => ({ ids: [] as number[], nextCursor: null }));
  const cacheKeyBase = `dashboard:summary:${role}:${userId}:${JSON.stringify(normalizeCacheFilterValue(filters ?? {}))}`;

  // Promise di bawah dimulai eager tapi baru dikonsumsi di gelombang 2/3 —
  // dan bisa di-skip total bila path snapshot terpakai. Tanpa handler
  // seketika, kegagalan (mis. DB overload → P2010) menjadi unhandledRejection
  // yang bisa menjatuhkan proses web. `.catch` di sini menjadikannya
  // best-effort dengan fallback aman (kode konsumen memang menganggapnya opsional).
  const validasiCountPromise: Promise<number> = (
    !countOnly && includeValidasi && validasiBaseWhere
      ? getOrSetCacheSwr(`${cacheKeyBase}:validasi_count`, () => countValidasiTickets(validasiBaseWhere), DASHBOARD_CACHE_TTL)
      : Promise.resolve(0)
  ).catch(() => 0);
  const statusOptionsPromise: Promise<string[]> = (
    includeOptions && !countOnly
      ? getTicketStatusOptions(statusOptionsWhere ?? where)
      : Promise.resolve([] as string[])
  ).catch(() => [] as string[]);
  const ticketTypeOptionsPromise: Promise<TicketTypeOption[]> = (
    includeOptions && !countOnly
      ? getTicketTypeOptions(
          buildMainTableWhere(ticketTypeOptionsWhere ?? where),
          includeValidasi && validasiBaseWhere && ticketTypeOptionsWhere
            ? buildValidasiBaseWhere(ticketTypeOptionsWhere)
            : null,
        )
      : Promise.resolve([] as TicketTypeOption[])
  ).catch(() => [] as TicketTypeOption[]);

  // Gelombang 1 — pagination (priority tinggi, user lihat data dulu)
  const [ticketIdsResult] = await Promise.all([
    ticketIdsPromise,
  ]);
  const ticketIds = ticketIdsResult.rows;
  const mainNextCursor = ticketIdsResult.nextCursor;

  // Gelombang 2 — summary metrics
  let summary: any;
  let customerTypeSummary: CustomerTypeSummary;
  let flaggingSummary: FlaggingSummary;
  let validasiCount: number;

  if (includeSummary) {
    const hasBucketFilter = !!filters?.operationalBucket;
    const snapshotData = hasBucketFilter ? null : await trySnapshotForSummary(mainTableWhere);
    if (snapshotData) {
      ({ summary, customerTypeSummary, flaggingSummary } = snapshotData);
      validasiCount = 0;
    } else {
      const result = await countStatusesAndCustomerTypes(mainTableWhere);
      summary = result.summary;
      customerTypeSummary = result.customerTypeSummary;
      if (countOnly) {
        flaggingSummary = { ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 };
        validasiCount = 0;
      } else {
        const [fs, vc] = await limitedPromiseAll<
          [() => Promise<FlaggingSummary>, () => Promise<number>]
        >([
          () => countFlaggingSummary(mainTableWhere, validasiBaseWhere),
          () => validasiCountPromise,
        ]);
        flaggingSummary = fs;
        validasiCount = vc;
      }
    }
  } else {
    summary = { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0, unassigned: 0 };
    customerTypeSummary = { hvcDiamond: 0, hvcPlatinum: 0, hvcGold: 0, reguler: 0 };
    flaggingSummary = { ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 };
    validasiCount = 0;
  }

  // Gelombang 3 — optional filters
  const [validasiTicketIdsResult, statusOptions, ticketTypeOptions] = await limitedPromiseAll<
    [() => Promise<{ ids: number[]; nextCursor: string | null }>, () => Promise<string[]>, () => Promise<TicketTypeOption[]>]
  >([
    () => validasiTicketIdsPromise,
    () => statusOptionsPromise,
    () => ticketTypeOptionsPromise,
  ]);
  const validasiTicketIds = validasiTicketIdsResult.ids;
  const validasiNextCursor = validasiTicketIdsResult.nextCursor;

  const rankMap = new Map<number, number>();
  const ticketIdList = ticketIds.map((r) => {
    rankMap.set(r.id_ticket, r.rank_global);
    return r.id_ticket;
  });

  const [tickets, validasiTickets] = await limitedPromiseAll<
    [() => Promise<Awaited<ReturnType<typeof hydrateTicketsByIds>>>, () => Promise<Awaited<ReturnType<typeof hydrateTicketsByIds>>>]
  >([
    () => hydrateTicketsByIds(ticketIdList),
    () =>
      includeValidasiTickets
        ? hydrateTicketsByIds(validasiTicketIds)
        : Promise.resolve([] as Awaited<ReturnType<typeof hydrateTicketsByIds>>),
  ]);

  const mappedTickets = tickets.filter((t): t is NonNullable<typeof t> => t != null).map((t) => {
    const mapped = mapTicket(t);
    const rank = rankMap.get(t.id_ticket);
    if (rank !== undefined) {
      (mapped as any).rank = rank;
    }
    return mapped;
  });

  return {
    total: summary.total,
    summary: {
      total: summary.total,
      open: summary.open,
      assigned:
        (summary.assigned ?? 0) +
        (summary.onProgress ?? 0) +
        (summary.pending ?? 0),
      close: summary.close,
      ...flaggingSummary,
    },
    customerTypeSummary,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(summary.total / safeLimit)),
    statusOptions,
    ticketTypeOptions,
    data: mappedTickets,
    validasiCount: validasiCount,
    validasiPage: safeValidasiPage,
    validasiLimit: safeValidasiLimit,
    validasiTotalPages: Math.max(1, Math.ceil(validasiCount / safeValidasiLimit)),
    validasiTickets: validasiTickets.map(mapTicket),
    nextCursor: mainNextCursor,
    validasiNextCursor: validasiNextCursor,
  };
}

export async function getDailyTicketIds(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<number[]> {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed: filters?.includeClosed === true,
  });
  const [whereClause, params] = buildSqlWhereClause(mainTableWhere);
  const rows = await queryRawWithOptionalIndex<Array<{ id_ticket: number }>>(
    `SELECT id_ticket FROM ticket WHERE ${whereClause}`,
    `SELECT id_ticket FROM ticket WHERE ${whereClause}`,
    params,
  );
  return rows.map((row) => row.id_ticket);
}

export async function buildDailyTicketSqlParams(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<[string, any[]]> {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed: filters?.includeClosed === true,
  });
  return buildSqlWhereClause(mainTableWhere);
}

function buildDailySummarySql(): string {
  const closeStatusList = CLOSE_STATUS_VALUES.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
  return `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN (${closeStatusList}) THEN 1 ELSE 0 END) AS close,
      SUM(CASE WHEN status NOT IN (${closeStatusList}) AND status_update IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 1 ELSE 0 END) AS assigned,
      SUM(CASE WHEN status NOT IN (${closeStatusList}) AND status_update = 'on_progress' THEN 1 ELSE 0 END) AS onProgress,
      SUM(CASE WHEN status NOT IN (${closeStatusList}) AND status_update = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status NOT IN (${closeStatusList}) AND (status_update NOT IN ('assigned', 'on_progress', 'pending', 'escalated', 'close') OR status_update IS NULL) THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN LOWER(COALESCE(guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND LOWER(TRIM(ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
    FROM ticket
    WHERE %s
  `;
}

export async function getDailyTicketSummary(
  role: string,
  userId: number,
  filters?: TicketFilters,
) {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed: filters?.includeClosed === true,
  });
  const validasiBaseWhere = buildValidasiBaseWhere(where);

  const [mainWhereClause, mainParams] = buildSqlWhereClause(mainTableWhere);
  const combinedSql = buildDailySummarySql().replace('%s', mainWhereClause);

  const [mainRow] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
    combinedSql, combinedSql, mainParams,
  );

  let vRow: Record<string, unknown> = {};
  if (validasiBaseWhere) {
    const [vSql, vParams] = buildSqlWhereClause(validasiBaseWhere);
    const validasiSql = `
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
        SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND LOWER(TRIM(ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
        SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
        SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
      FROM ticket
      WHERE ${vSql}
    `;
    const [vRows] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
      validasiSql, validasiSql, vParams,
    );
    vRow = vRows ?? {};
  }

  return {
    total: Number(mainRow?.total ?? 0),
    open: Number(mainRow?.open ?? 0),
    assigned: Number(mainRow?.assigned ?? 0) + Number(mainRow?.onProgress ?? 0) + Number(mainRow?.pending ?? 0),
    close: Number(mainRow?.close ?? 0),
    ffgCount: Number(mainRow?.ffg ?? 0) + Number(vRow.ffg ?? 0),
    gamasCount: Number(mainRow?.gamas ?? 0) + Number(vRow.gamas ?? 0),
    p1Count: Number(mainRow?.p1 ?? 0) + Number(vRow.p1 ?? 0),
    pPlusCount: Number(mainRow?.p_plus ?? 0) + Number(vRow.p_plus ?? 0),
  };
}

export async function hasDailyTicketHit(
  role: string,
  userId: number,
  filters?: TicketFilters,
) {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const ticket = await prisma.ticket.findFirst({
    where,
    select: { id_ticket: true },
  });

  return Boolean(ticket);
}

export async function hasDailyValidasiHit(
  role: string,
  userId: number,
  filters?: TicketFilters,
) {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const validasiWhere = buildValidasiBaseWhere(where);
  if (!validasiWhere) return false;

  const ticket = await prisma.ticket.findFirst({
    where: validasiWhere,
    select: { id_ticket: true },
  });

  return Boolean(ticket);
}
