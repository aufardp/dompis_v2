// Grup "stats/trend/actions" untuk domain Daily Ticket — dipisah dari
// daily-ticket.service.ts (yang tadinya 3521 baris) semata untuk memecah unit
// kompilasi jadi lebih kecil. Method `static` di class asli jadi fungsi biasa
// di sini (pemanggilan `this.xxx()` jadi `xxx()` langsung); tidak ada
// perubahan logic.

import prisma from '@/app/libs/prisma';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '../../helpers/ticket.helpers';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';
import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';
import { getJenisWhereClause } from '@/app/config/jenis-tiket';
import {
  type OperationalBucketKey,
  normalizeOperationalBucketKey,
} from '@/app/config/operational-buckets';
import { buildOperationalBucketWhere } from './ticket-buckets';
import { addDays, addHours, startOfDay, startOfHour, subDays } from 'date-fns';
import { format, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getTodayWibRange } from '@/lib/timezone';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import {
  type TicketFilters,
  buildSqlWhereClause,
  buildDeptSegmentWhere,
  applyStatusUpdateWhere,
} from './daily-ticket-helpers';
import {
  buildDailyTicketWhere,
  buildMainTableWhere,
  buildWorkzoneWhere,
  applyDailyTicketFilter,
  applyBranchScopeWhere,
  resolveSelectedWorkzone,
} from './daily-ticket-where';
import { countStatuses } from './daily-ticket-table';

/**
 * Daily Stats
 */

export async function buildDetailWoHiWhere(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<Record<string, any>> {
  const [kpiCustomerWhere, nonKpiWhere] = await Promise.all([
    buildDailyTicketWhere(role, userId, {
      ...filters,
      operationalBucket: ['kpi_customer'],
    }),
    buildDailyTicketWhere(role, userId, {
      ...filters,
      operationalBucket: undefined,
    }),
  ]);

  const kpiCustomerBucketWhere = buildOperationalBucketWhere('kpi_customer');

  return {
    OR: [
      kpiCustomerWhere,
      { AND: [nonKpiWhere, { NOT: kpiCustomerBucketWhere }] },
    ],
  };
}

export async function getDailyStats(
  role: string,
  userId: number,
  saId?: number,
  p0?: {
    dept: string | undefined;
    ticketType: string | undefined;
    statusUpdate: string | undefined;
  },
) {
  const selectedWorkzone = await resolveSelectedWorkzone(saId);

  const where = await buildWorkzoneWhere(role, userId, selectedWorkzone);

  await applyDailyTicketFilter(where);

  // Apply dept filter (B2B/B2C)
  const deptSegmentWhere = buildDeptSegmentWhere(p0?.dept);
  if (deptSegmentWhere) {
    where.AND = [
      ...(where.AND ?? []),
      deptSegmentWhere,
    ];
  }

  // Apply ticketType filter
  if (p0?.ticketType && p0.ticketType !== 'all') {
    Object.assign(where, getJenisWhereClause(p0.ticketType));
  }

  // Apply statusUpdate filter
  if (p0?.statusUpdate && p0.statusUpdate !== 'all') {
    applyStatusUpdateWhere(where, p0.statusUpdate);
  }

  const mainTableWhere = buildMainTableWhere(where);
  return countStatuses(mainTableWhere);
}

/**
 * Daily Stats by Service Area
 */

export async function getDailyStatsByServiceArea(
  role: string,
  userId: number,
  saId?: number,
  options?: { dept?: string; ticketType?: string; statusUpdate?: string },
): Promise<
  Array<{
    id_sa: number;
    nama_sa: string;
    total: number;
    unassigned: number;
    open: number;
    assigned: number;
    onProgress: number;
    pending: number;
    close: number;
  }>
> {
  const workzones = isAdminRole(role)
    ? await getWorkzonesForUser(userId)
    : [];

  if (workzones.length === 0) return [];

  const serviceAreas = await prisma.service_area.findMany({
    where: {
      nama_sa: { in: workzones },
    },
    select: {
      id_sa: true,
      nama_sa: true,
    },
  });

  if (serviceAreas.length === 0) return [];

  // Build base WHERE with common filters (shared across all SAs)
  const baseWhere: Record<string, any> = {};
  await applyDailyTicketFilter(baseWhere);

  if (options?.statusUpdate && options.statusUpdate !== 'all') {
    applyStatusUpdateWhere(baseWhere, options.statusUpdate);
  }

  if (options?.dept && options.dept !== 'all') {
    let clause: Record<string, any> | null = null;
    if (options.dept === 'b2c' || options.dept === 'b2b') {
      clause = buildDeptSegmentWhere(options.dept) as Record<string, any>;
    } else {
      clause = getJenisWhereClause(options.dept);
    }
    if (clause) {
      baseWhere.AND = [...(baseWhere.AND ?? []), clause];
    }
  }

  if (options?.ticketType && options.ticketType !== 'all') {
    baseWhere.AND = [
      ...(baseWhere.AND ?? []),
      getJenisWhereClause(options.ticketType),
    ];
  }

  // Single groupBy with workzone + status_update
  const workzoneNames = serviceAreas
    .map((sa) => sa.nama_sa)
    .filter((name): name is string => Boolean(name && name.trim()));

  const fullWhere: Record<string, any> = {
    ...baseWhere,
    AND: [
      ...(baseWhere.AND ?? []),
      { workzone: { in: workzoneNames } },
    ],
  };

  const grouped = await prisma.ticket.groupBy({
    by: ['workzone', 'status_update'],
    where: fullWhere,
    _count: { _all: true },
  });

  // Aggregate by workzone
  const statsByWorkzone = new Map<string, { total: number; open: number; assigned: number; onProgress: number; pending: number; close: number }>();
  for (const g of grouped) {
    const wz = g.workzone ?? '';
    if (!statsByWorkzone.has(wz)) {
      statsByWorkzone.set(wz, { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 });
    }
    const stats = statsByWorkzone.get(wz)!;
    const count = g._count._all;
    stats.total += count;
    const status = String(g.status_update ?? '')
      .trim()
      .toLowerCase() || 'open';
    if (status === 'open') stats.open += count;
    else if (status === 'assigned') stats.assigned += count;
    else if (status === 'on_progress') stats.onProgress += count;
    else if (status === 'pending') stats.pending += count;
    else if (status === 'close') stats.close += count;
  }

  // Map to service areas
  const results = serviceAreas.map(sa => {
    let total = 0, open = 0, assigned = 0, onProgress = 0, pending = 0, close = 0;
    const saName = (sa.nama_sa ?? '').toLowerCase();
    for (const [wz, stats] of statsByWorkzone) {
      if (wz.toLowerCase() === saName) {
        total += stats.total;
        open += stats.open;
        assigned += stats.assigned;
        onProgress += stats.onProgress;
        pending += stats.pending;
        close += stats.close;
      }
    }
    return {
      id_sa: sa.id_sa,
      nama_sa: sa.nama_sa ?? '',
      total,
      unassigned: open,
      open,
      assigned,
      onProgress,
      pending,
      close,
    };
  });

  return results.sort((a, b) => b.total - a.total);
}

/**
 * Workflow delegation
 */

export async function assignToUser(
  ticketId: number,
  teknisiUserId: number,
  actor: ActorContext,
) {
  return TicketWorkflowService.assignToUser(ticketId, teknisiUserId, actor);
}

export async function unassign(ticketId: number, role?: string, userId?: number) {
  if (!role || !userId) {
    throw new Error('Unauthorized');
  }

  return TicketWorkflowService.unassignTicket(ticketId, {
    id_user: userId,
    role,
  });
}

export async function pickup(ticketId: number, teknisiUserId: number) {
  return TicketWorkflowService.pickupTicket(ticketId, {
    id_user: teknisiUserId,
    role: 'teknisi',
  });
}

export async function close(
  ticketId: number,
  teknisiUserId: number,
  rca: string,
  subRca: string,
  descriptionSolutionDompis: string,
) {
  return TicketWorkflowService.closeTicket(
    ticketId,
    { id_user: teknisiUserId, role: 'teknisi' },
    rca,
    subRca,
    descriptionSolutionDompis,
  );
}

export async function getHourlyTicketCounts(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<Array<{ hour: number; count: number }>> {
  const selectedWorkzone = await resolveSelectedWorkzone(filters?.workzone);
  const scopedWhere: Record<string, any> = {
    ...(await buildWorkzoneWhere(role, userId, selectedWorkzone)),
  };

  await applyBranchScopeWhere(scopedWhere, filters?.branchId);

  const deptSegmentWhere = buildDeptSegmentWhere(filters?.dept);
  if (deptSegmentWhere) {
    scopedWhere.AND = [...(scopedWhere.AND ?? []), deptSegmentWhere];
  }

  const bucketKey = filters?.operationalBucket?.length === 1
    ? filters.operationalBucket[0] as OperationalBucketKey
    : null;
  if (bucketKey) {
    const bucketWhere = buildOperationalBucketWhere(bucketKey);
    if (bucketWhere) {
      scopedWhere.AND = [...(scopedWhere.AND ?? []), bucketWhere];
    }
  }

  const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
  const startWib = fromZonedTime(startOfDay(wibNow), 'Asia/Jakarta');
  const nextHourWib = fromZonedTime(
    addHours(startOfHour(wibNow), 1),
    'Asia/Jakarta',
  );

  const [whereClause, params] = buildSqlWhereClause(scopedWhere);

  const sql = `
    SELECT
      HOUR(reported_date + INTERVAL 7 HOUR) AS hour,
      COUNT(*) AS count
    FROM ticket
    WHERE ${whereClause}
      AND reported_date IS NOT NULL
      AND TRIM(reported_date) != ''
      AND reported_date >= ?
      AND reported_date < ?
    GROUP BY HOUR(reported_date + INTERVAL 7 HOUR)
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{ hour: number; count: bigint | number }>>(
    withMaxExecutionTime(sql),
    ...params,
    startWib,
    nextHourWib,
  );

  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const row of rows) {
    const hour = Number(row.hour);
    const count = Number(row.count ?? 0);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;
    counts[hour].count = count;
  }

  return counts;
}

export async function getHourlyCloseCounts(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<Array<{ hour: number; count: number }>> {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed: filters?.includeClosed === true,
  });
  const [whereClause, params] = buildSqlWhereClause(mainTableWhere);
  const { start, end } = getTodayWibRange();
  const currentHourWib = toZonedTime(new Date(), 'Asia/Jakarta').getHours();

  const closeStatusSql = CLOSE_STATUS_VALUES.map((status) => `'${status}'`).join(', ');
  const sql = `
    SELECT
      HOUR(closed_at) AS hour,
      COUNT(*) AS count
    FROM ticket
    WHERE ${whereClause}
      AND closed_at IS NOT NULL
      AND closed_at >= ?
      AND closed_at < ?
      AND status IN (${closeStatusSql})
    GROUP BY HOUR(closed_at)
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{ hour: number; count: bigint | number }>>(
    withMaxExecutionTime(sql),
    ...params,
    start,
    end,
  );

  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const row of rows) {
    const utcHour = Number(row.hour);
    const count = Number(row.count ?? 0);
    if (!Number.isFinite(utcHour) || utcHour < 0 || utcHour > 23) continue;
    const wibHour = (utcHour + 7) % 24;
    if (wibHour > currentHourWib) continue;
    counts[wibHour].count += count;
  }

  return counts;
}

export async function getDailyTrend(
  role: string,
  userId: number,
  filters?: TicketFilters,
  days = 7,
): Promise<Array<{ date: string; masuk: number; close: number }>> {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed: filters?.includeClosed === true,
  });
  const [whereClause, params] = buildSqlWhereClause(mainTableWhere);

  const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
  const startWib = startOfDay(subDays(wibNow, days - 1));
  const startUtc = fromZonedTime(startWib, 'Asia/Jakarta');

  const closeStatusSql = CLOSE_STATUS_VALUES.map((status) => `'${status}'`).join(', ');

  const sql = `
    SELECT day, SUM(masuk) AS masuk, SUM(close) AS close
    FROM (
      SELECT
        DATE_FORMAT(DATE(booking_date + INTERVAL 7 HOUR), '%Y-%m-%d') AS day,
        COUNT(*) AS masuk,
        0 AS close
      FROM ticket
      WHERE ${whereClause}
        AND booking_date IS NOT NULL
        AND booking_date >= ?
      GROUP BY day
      UNION ALL
      SELECT
        DATE_FORMAT(DATE(closed_at + INTERVAL 7 HOUR), '%Y-%m-%d') AS day,
        0 AS masuk,
        COUNT(*) AS close
      FROM ticket
      WHERE ${whereClause}
        AND closed_at IS NOT NULL
        AND status IN (${closeStatusSql})
        AND closed_at >= ?
      GROUP BY day
    ) combined
    GROUP BY day
  `;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      day: string;
      masuk: bigint | number;
      close: bigint | number;
    }>
  >(withMaxExecutionTime(sql), ...params, startUtc, ...params, startUtc);

  const map = new Map<string, { date: string; masuk: number; close: number }>();
  for (let i = 0; i < days; i++) {
    const d = addDays(startWib, i);
    const key = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Jakarta' });
    map.set(key, { date: key, masuk: 0, close: 0 });
  }
  for (const row of rows) {
    const entry = map.get(row.day);
    if (!entry) continue;
    entry.masuk += Number(row.masuk ?? 0);
    entry.close += Number(row.close ?? 0);
  }

  return [...map.values()];
}

export async function getTopSymptoms(
  role: string,
  userId: number,
  limit = 10,
  filters?: TicketFilters,
): Promise<Array<{ symptom: string; count: number }>> {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where, {
    includeClosed: filters?.includeClosed === true,
  });
  const [sqlWhere, params] = buildSqlWhereClause(mainTableWhere);
  const sql = `
    SELECT
      symptom_clean,
      COUNT(*) AS count
    FROM (
      SELECT
        REGEXP_REPLACE(TRIM(symptom), '\\\\s+', ' ') AS symptom_clean
      FROM ticket
      WHERE ${sqlWhere}
        AND symptom IS NOT NULL
        AND symptom != ''
    ) AS cleaned
    GROUP BY symptom_clean
    ORDER BY count DESC, symptom_clean ASC
    LIMIT ?
  `;
  const rows = await prisma.$queryRawUnsafe<Array<{ symptom_clean: string; count: bigint }>>(withMaxExecutionTime(sql), ...params, limit);
  return rows.map((r) => ({ symptom: r.symptom_clean, count: Number(r.count) }));
}

export async function getB2CBreakdown(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<{
  summary: {
    total: number; open: number; assigned: number; close: number;
    customerCount: number; sqmCount: number; unspecCount: number;
    ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number;
  };
  reguler: {
    total: number; open: number; assigned: number; close: number;
    customerCount: number; sqmCount: number; unspecCount: number;
    ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number;
  };
  hvcGold: {
    total: number; open: number; assigned: number; close: number;
    customerCount: number; sqmCount: number; unspecCount: number;
    ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number;
  };
  hvcPlatinum: {
    total: number; open: number; assigned: number; close: number;
    customerCount: number; sqmCount: number; unspecCount: number;
    ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number;
  };
  hvcDiamond: {
    total: number; open: number; assigned: number; close: number;
    customerCount: number; sqmCount: number; unspecCount: number;
    ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number;
  };
}> {
  const where = await buildDailyTicketWhere(role, userId, filters);
  const mainTableWhere = buildMainTableWhere(where);
  const [sqlWhere, params] = buildSqlWhereClause(mainTableWhere);
  const rawBucket = filters?.operationalBucket?.[0];
  const bucket = rawBucket ? normalizeOperationalBucketKey(rawBucket) : undefined;

  const zero = () => ({
    total: 0, open: 0, assigned: 0, close: 0,
    customerCount: 0, sqmCount: 0, unspecCount: 0,
    ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0,
  });

  const sql = `
    SELECT
      CASE
        WHEN LOWER(customer_type) IN ('hvc_diamond','hvc diamond','diamond') THEN 'HVC_DIAMOND'
        WHEN LOWER(customer_type) IN ('hvc_platinum','hvc platinum','platinum') THEN 'HVC_PLATINUM'
        WHEN LOWER(customer_type) IN ('hvc_gold','hvc gold','gold') THEN 'HVC_GOLD'
        WHEN LOWER(customer_type) IN ('reguler','regular') THEN 'REGULER'
        ELSE 'OTHER'
      END AS cust_type,
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(status_update) = 'open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN LOWER(status_update) = 'assigned' THEN 1 ELSE 0 END) AS assigned,
      SUM(CASE WHEN LOWER(status_update) IN ('close','closed') THEN 1 ELSE 0 END) AS close,
      SUM(CASE
        WHEN jenis_tiket_2 IS NULL OR jenis_tiket_2 = ''
          OR LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) IN ('reguler', 'regular', 'hvc')
          OR LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) LIKE 'reguler-%'
          OR LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) LIKE 'regular-%'
          OR LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) LIKE 'hvc-%'
        THEN 1 ELSE 0 END
      ) AS customer_count,
      SUM(CASE
        WHEN LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) LIKE 'sqm%'
        THEN 1 ELSE 0 END
      ) AS sqm_count,
      SUM(CASE
        WHEN jenis_tiket_2 IS NOT NULL AND jenis_tiket_2 != ''
          AND LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) NOT LIKE 'reguler-%'
          AND LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) NOT LIKE 'regular-%'
          AND LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) NOT LIKE 'hvc-%'
          AND LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) NOT IN ('reguler', 'regular', 'hvc')
          AND LOWER(TRIM(REPLACE(REPLACE(jenis_tiket_2, ' ', '-'), '_', '-'))) NOT LIKE 'sqm%'
        THEN 1 ELSE 0 END
      ) AS unspec_count,
      SUM(CASE
        WHEN LOWER(guarantee_status) = 'guarantee'
        THEN 1 ELSE 0 END) AS ffg_count,
      SUM(CASE
        WHEN ticket_id_gamas IS NOT NULL
          AND ticket_id_gamas != ''
          AND ticket_id_gamas != '-'
          AND ticket_id_gamas != '--'
        THEN 1 ELSE 0 END) AS gamas_count,
      SUM(CASE
        WHEN LOWER(flagging_manja) = 'p1'
        THEN 1 ELSE 0 END) AS p1_count,
      SUM(CASE
        WHEN LOWER(flagging_manja) IN ('p+', 'pplus')
        THEN 1 ELSE 0 END) AS pplus_count
    FROM ticket
    WHERE ${sqlWhere}
      AND customer_segment IN ('DCS', 'PL-TSEL')
    GROUP BY cust_type
  `;

  console.log('[B2CBreakdown] SQL:', sql.replace(/\s+/g, ' '));
  console.log('[B2CBreakdown] params:', JSON.stringify(params));

  const rows = await prisma.$queryRawUnsafe<Array<{
    cust_type: string;
    total: bigint; open: bigint; assigned: bigint; close: bigint;
    customer_count: bigint; sqm_count: bigint; unspec_count: bigint;
    ffg_count: bigint; gamas_count: bigint; p1_count: bigint; pplus_count: bigint;
  }>>(withMaxExecutionTime(sql), ...params);

  const mapRow = (r: typeof rows[number]) => ({
    total: Number(r.total),
    open: Number(r.open),
    assigned: Number(r.assigned),
    close: Number(r.close),
    customerCount: Number(r.customer_count),
    sqmCount: Number(r.sqm_count),
    unspecCount: Number(r.unspec_count),
    ffgCount: Number(r.ffg_count),
    gamasCount: Number(r.gamas_count),
    p1Count: Number(r.p1_count),
    pPlusCount: Number(r.pplus_count),
  });

  let summary = zero();
  const byType: Record<string, ReturnType<typeof mapRow>> = { OTHER: zero() };

  for (const row of rows) {
    const mapped = mapRow(row);
    if (row.cust_type === 'OTHER') {
      byType.OTHER = mapped;
    } else {
      byType[row.cust_type] = mapped;
    }
    summary = {
      total: summary.total + mapped.total,
      open: summary.open + mapped.open,
      assigned: summary.assigned + mapped.assigned,
      close: summary.close + mapped.close,
      customerCount: summary.customerCount + mapped.customerCount,
      sqmCount: summary.sqmCount + mapped.sqmCount,
      unspecCount: summary.unspecCount + mapped.unspecCount,
      ffgCount: summary.ffgCount + mapped.ffgCount,
      gamasCount: summary.gamasCount + mapped.gamasCount,
      p1Count: summary.p1Count + mapped.p1Count,
      pPlusCount: summary.pPlusCount + mapped.pPlusCount,
    };
  }

  function applyBucketCounts(
    tier: { total: number; customerCount: number; sqmCount: number; unspecCount: number },
  ): void {
    switch (bucket) {
      case 'kpi_customer':
        tier.customerCount = tier.total;
        tier.sqmCount = 0;
        tier.unspecCount = 0;
        break;
      case 'kpi_proactive':
      case 'sqm_update':
        tier.customerCount = 0;
        tier.sqmCount = tier.total;
        tier.unspecCount = 0;
        break;
      case 'non_kpi_unspec':
        tier.customerCount = 0;
        tier.sqmCount = 0;
        tier.unspecCount = tier.total;
        break;
    }
  }

  const result = {
    summary,
    reguler: byType.REGULER ?? zero(),
    hvcGold: byType.HVC_GOLD ?? zero(),
    hvcPlatinum: byType.HVC_PLATINUM ?? zero(),
    hvcDiamond: byType.HVC_DIAMOND ?? zero(),
  };

  if (bucket) {
    applyBucketCounts(result.summary);
    applyBucketCounts(result.reguler);
    applyBucketCounts(result.hvcGold);
    applyBucketCounts(result.hvcPlatinum);
    applyBucketCounts(result.hvcDiamond);
  }

  return result;
}
