// Grup "where-builder" untuk domain Daily Ticket — dipisah dari
// daily-ticket.service.ts (yang tadinya 3521 baris) semata untuk memecah unit
// kompilasi jadi lebih kecil. Method `static`/`private` di class asli jadi
// fungsi biasa di sini (pemanggilan `this.xxx()` jadi `xxx()` langsung);
// tidak ada perubahan logic.

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getBranchServiceAreaNames,
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';
import { todayWibDateForDb, getTodayWibRange } from '@/lib/timezone';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import {
  type TicketFilters,
  buildTicketSearchWhere,
  applyStatusUpdateWhere,
  applyTicketStatusWhere,
  applyTicketTypeWhere,
  applyTicketGroupWhere,
  applyOperationalBucketFilterWhere,
  applyRegulerOnlyWhere,
  applyAnomalyBucketFilterWhere,
  applyFlaggingWhere,
  buildDeptSegmentWhere,
  buildSqlWhereClause,
  splitDailyFilterUnion,
  buildMainTableOrderBySql,
} from './daily-ticket-helpers';

/**
 * Get latest operational sync_date from DB
 */
export async function getLatestSyncDate(
  tx?: Prisma.TransactionClient,
): Promise<Date | null> {
  const db = tx ?? prisma;

  const result = await db.ticket.aggregate({
    _max: { sync_date: true },
  });

  return result._max.sync_date ?? null;
}

/**
 * Daily filter for the operational board.
 * - Tickets synced today AND NOT fully closed in backend (status != 'closed') OR
 * - Tickets synced today that were closed TODAY (closed_at >= today start WIB) OR
 * - Carry-over tickets with pending_dompis (not yet closed)
 *
 * This ensures:
 * 1. Active tickets appear on the board
 * 2. Tickets closed today still appear (with closed indicator)
 * 3. Old closed tickets that get re-synced do NOT appear
 */
export async function applyDailyTicketFilter(
  where: Record<string, any>,
  tx?: Prisma.TransactionClient,
  legacyFilter?: boolean,
) {
  const today = todayWibDateForDb();
  const { start: todayStart } = getTodayWibRange();

  if (legacyFilter) {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { AND: [{ sync_date: today }, { status: { not: 'closed' } }] },
          { AND: [{ sync_date: today }, { status: 'closed' }, { closed_at: { gte: todayStart } }] },
          { AND: [{ sync_date: today }, { status_update: 'close' }, { status: 'closed' }] },
          { AND: [{ pending_dompis: { not: null } }, { pending_dompis: { not: '' } }, { status: { not: 'closed' } }] },
        ],
      },
    ];
    return;
  }

  where.AND = [
    ...(where.AND ?? []),
    {
      OR: [
        { status: { notIn: [...CLOSE_STATUS_VALUES] } },
        { AND: [{ status: { in: [...CLOSE_STATUS_VALUES] } }, { closed_at: { gte: todayStart } }] },
      ],
    },
  ];
}

/**
 * Workzone filter
 */

export async function buildWorkzoneWhere(
  role: string,
  userId: number,
  selectedWorkzone?: string | null,
): Promise<Record<string, any>> {
  if (role === 'superadmin' || role === 'super_admin') {
    if (selectedWorkzone) {
      return { workzone: selectedWorkzone };
    }

    return {};
  }

  if (role === 'teknisi') {
    const where: Record<string, any> = {
      teknisi_user_id: userId,
    };

    if (selectedWorkzone) {
      where.workzone = selectedWorkzone;
    }

    return where;
  }

  if (isAdminRole(role)) {
    const workzones = await getWorkzonesForUser(userId);

    if (workzones.length === 0) {
      return { id_ticket: 0 };
    }

    if (selectedWorkzone) {
      return workzones.includes(selectedWorkzone)
        ? { workzone: selectedWorkzone }
        : { id_ticket: 0 };
    }

    return {
      workzone: { in: workzones },
    };
  }

  return {};
}

/**
 * Apply branch → Service Area scope to an existing ticket WHERE object.
 * Intersects with any existing workzone filter; branch SA names come from
 * getBranchServiceAreaNames (cached 3600s).
 */
export async function applyBranchScopeWhere(
  where: Record<string, any>,
  branchId?: number | string,
): Promise<void> {
  const id = Number(branchId);
  if (!Number.isFinite(id) || id <= 0) return;

  const branchSas = await getBranchServiceAreaNames(id);
  if (branchSas.length === 0) {
    where.id_ticket = 0;
    return;
  }

  const existing = where.workzone;
  if (existing === undefined || existing === null) {
    where.workzone = { in: branchSas };
    return;
  }

  if (typeof existing === 'string') {
    where.workzone = {
      in: branchSas.filter((sa) => sa === existing),
    };
    return;
  }

  if (typeof existing === 'object' && Array.isArray((existing as any).in)) {
    where.workzone = {
      in: ((existing as any).in as unknown[]).filter(
        (sa): sa is string => typeof sa === 'string' && branchSas.includes(sa),
      ),
    };
    return;
  }

  where.workzone = { in: branchSas };
}

export async function resolveSelectedWorkzone(
  saId?: number | string,
): Promise<string | null> {
  const id = Number(saId);

  if (!Number.isFinite(id) || id <= 0) return null;

  return resolveWorkzoneName(id);
}

export async function buildDailyTicketWhere(
  role: string,
  userId: number,
  filters?: TicketFilters,
): Promise<Record<string, any>> {
  const {
    search = '',
    ticketId,
    symptom = '',
    excludeSymptom = '',
    statusUpdate,
    ticketStatus,
    dept,
    ticketType,
    ticketGroup,
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    flagging,
    workzone,
    branchId,
    startDate,
    endDate,
    ctype,
    searchType,
    globalScope,
    gamasOnly,
  } = filters ?? {};

  const selectedWorkzone = await resolveSelectedWorkzone(workzone);
  const effectiveRole =
    globalScope && (role === 'admin' || role === 'superadmin' || role === 'super_admin')
      ? 'superadmin'
      : role;

  const where: Record<string, any> = {
    ...(await buildWorkzoneWhere(effectiveRole, userId, selectedWorkzone)),
  };

  await applyBranchScopeWhere(where, branchId);

  const isLegacyKpi = Array.isArray(operationalBucket)
    ? operationalBucket.includes('kpi_customer')
    : operationalBucket === 'kpi_customer';
  await applyDailyTicketFilter(where, undefined, isLegacyKpi);

  const searchWhere = buildTicketSearchWhere(search, searchType);
  if (searchWhere) {
    where.AND = [
      ...(where.AND ?? []),
      searchWhere,
    ];
  }

  if (Number.isFinite(ticketId) && Number(ticketId) > 0) {
    where.AND = [
      ...(where.AND ?? []),
      {
        id_ticket: Number(ticketId),
      },
    ];
  }

  const normalizedSymptom = String(symptom ?? '').trim();
  if (normalizedSymptom) {
    where.AND = [
      ...(where.AND ?? []),
      {
        symptom: {
          contains: normalizedSymptom,
        },
      },
    ];
  }

  const normalizedExcludeSymptom = String(excludeSymptom ?? '').trim();
  if (normalizedExcludeSymptom) {
    where.AND = [
      ...(where.AND ?? []),
      {
        NOT: {
          symptom: {
            contains: normalizedExcludeSymptom,
          },
        },
      },
    ];
  }

  if (startDate || endDate) {
    if (startDate && endDate) {
      where.AND = [
        ...(where.AND ?? []),
        {
          reported_date: {
            gte: startDate,
            lte: `${endDate} 23:59:59`,
          },
        },
      ];
    } else if (startDate) {
      where.AND = [
        ...(where.AND ?? []),
        {
          reported_date: { gte: startDate },
        },
      ];
    } else if (endDate) {
      where.AND = [
        ...(where.AND ?? []),
        {
          reported_date: { lte: `${endDate} 23:59:59` },
        },
      ];
    }
  }

  if (statusUpdate) {
    applyStatusUpdateWhere(where, statusUpdate);
  }

  if (ticketStatus) {
    applyTicketStatusWhere(where, ticketStatus);
  }

  if (ctype) {
    where.customer_type = ctype;
  }

  applyTicketTypeWhere(where, ticketType);
  applyTicketGroupWhere(where, ticketGroup);
  applyOperationalBucketFilterWhere(where, operationalBucket);
  applyRegulerOnlyWhere(where, regulerOnly);
  applyAnomalyBucketFilterWhere(where, anomalyBucket);
  applyFlaggingWhere(where, flagging);

  const deptSegmentWhere = buildDeptSegmentWhere(dept);
  if (deptSegmentWhere) {
    where.AND = [
      ...(where.AND ?? []),
      deptSegmentWhere,
    ];
  }

  if (gamasOnly) {
    where.AND = [
      ...(where.AND ?? []),
      {
        ticket_id_gamas: { not: null },
      },
      {
        ticket_id_gamas: { not: '' },
      },
    ];
  }

  return where;
}

export async function fetchTicketIdsBySql(
  where: Prisma.ticketWhereInput,
  options: {
    sort: 'asc' | 'desc';
    sortField?: string;
    offset: number;
    limit: number;
    priorityToday?: string | null;
    cursor?: string | null; // reported_date cursor for keyset pagination
  },
): Promise<{ rows: Array<{ id_ticket: number; rank_global: number }>; nextCursor: string | null }> {
  const [orderByClause, orderParams] = options.priorityToday
    ? buildMainTableOrderBySql(options.sort, options.priorityToday, options.sortField)
    : [
        `reported_date ${options.sort === 'asc' ? 'ASC' : 'DESC'}, id_ticket ASC`,
        [],
      ];

  const union = splitDailyFilterUnion(where);
  const sortDirection = options.sort === 'asc' ? 'ASC' : 'DESC';
  const cursor = options.cursor;

  // Build base WHERE clause
  let whereClause: string;
  let params: any[];
  if (union) {
    const [s1, s2] = union.branchSqls;
    const [p1, p2] = union.params;
    whereClause = `(${s1}) UNION ALL (${s2})`;
    params = [...p1, ...p2];
  } else {
    [whereClause, params] = buildSqlWhereClause(where);
  }

  // Keyset pagination: if cursor provided, use keyset pagination
  // Otherwise use ROW_NUMBER with OFFSET (page 1)
  let sql: string;
  let queryParams: any[];
  let nextCursor: string | null = null;

  if (cursor) {
    // Keyset pagination: use cursor to seek directly
    const cursorDirection = sortDirection === 'ASC' ? '>' : '<';
    const cursorOrder = sortDirection === 'ASC' ? 'ASC' : 'DESC';

    if (union) {
      const [s1, s2] = union.branchSqls;
      const [p1, p2] = union.params;
      sql = `
        SELECT id_ticket, reported_date
        FROM (
          SELECT id_ticket, reported_date, booking_date, flagging_manja, customer_type FROM ticket WHERE ${s1}
          UNION ALL
          SELECT id_ticket, reported_date, booking_date, flagging_manja, customer_type FROM ticket WHERE ${s2}
        ) AS daily_union
        WHERE reported_date ${cursorDirection} ?
        ORDER BY reported_date ${cursorOrder}, id_ticket ASC
        LIMIT ?
      `;
      queryParams = [...p1, ...p2, cursor, options.limit];
    } else {
      [whereClause, params] = buildSqlWhereClause(where);
      sql = `
        SELECT id_ticket, reported_date
        FROM ticket
        WHERE ${whereClause}
          AND reported_date ${cursorDirection} ?
        ORDER BY reported_date ${cursorOrder}, id_ticket ASC
        LIMIT ?
      `;
      queryParams = [...params, cursor, options.limit];
    }
  } else {
    // Page 1: keyset-style direct query (no ROW_NUMBER, no window materialization).
    // rank is computed client-side as offset-based position.
    if (union) {
      const [s1, s2] = union.branchSqls;
      const [p1, p2] = union.params;
      sql = `
        SELECT id_ticket, reported_date, booking_date, flagging_manja, customer_type
        FROM (
          SELECT id_ticket, reported_date, booking_date, flagging_manja, customer_type FROM ticket WHERE ${s1}
          UNION ALL
          SELECT id_ticket, reported_date, booking_date, flagging_manja, customer_type FROM ticket WHERE ${s2}
        ) AS daily_union
        ORDER BY ${orderByClause}
        LIMIT ?, ?
      `;
      queryParams = [...p1, ...p2, ...orderParams, options.offset, options.limit];
    } else {
      [whereClause, params] = buildSqlWhereClause(where);
      sql = `
        SELECT id_ticket, reported_date
        FROM ticket
        WHERE ${whereClause}
        ORDER BY ${orderByClause}
        LIMIT ?, ?
      `;
      queryParams = [...params, ...orderParams, options.offset, options.limit];
    }
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ id_ticket: number; reported_date?: string | Date }>>(
    withMaxExecutionTime(sql),
    ...queryParams,
  );

  const mappedRows = rows.map((row, index) => ({
    id_ticket: row.id_ticket,
    rank_global: options.offset + index + 1,
  }));

  // Determine next cursor from last row's reported_date
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (lastRow.reported_date) {
      nextCursor = lastRow.reported_date instanceof Date
        ? lastRow.reported_date.toISOString()
        : String(lastRow.reported_date);
    }
  }

  return { rows: mappedRows, nextCursor };
}

export function buildValidasiCondition(): Prisma.ticketWhereInput {
  if (process.env.VALIDASI_FLAG_ENABLED === 'true') {
    return {
      needs_validation: true,
    };
  }

  return {
    status: { notIn: [...CLOSE_STATUS_VALUES] },
    OR: [
      { worklog_summary: { contains: 'Tech Closed' } },
      { status_update: 'close' },
    ],
  };
}

export function buildValidasiBaseWhere(
  where: Record<string, any>,
): Prisma.ticketWhereInput | null {
  return {
    ...where,
    AND: [
      ...(where.AND ?? []),
      buildValidasiCondition(),
    ],
  };
}

export function buildMainTableWhere(
  where: Record<string, any>,
  options?: { includeClosed?: boolean },
): Prisma.ticketWhereInput {
  if (options?.includeClosed) {
    return where;
  }

  return {
    ...where,
    AND: [
      ...(where.AND ?? []),
      {
        OR: [
          { status: { notIn: [...CLOSE_STATUS_VALUES] } },
          { status: null },
        ],
      },
      {
        OR: [
          { status_update: { notIn: ['close', 'closed'] } },
          { status_update: null },
          { status_update: '' },
        ],
      },
    ],
  };
}
