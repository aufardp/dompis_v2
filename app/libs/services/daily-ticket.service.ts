import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';

import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';
import {
  getJenisWhereClause,
  JENIS_MAP,
} from '@/app/config/jenis-tiket';
import {
   type AnomalyBucketKey,
   normalizeAnomalyBucketKey,
   type OperationalBucketKey,
   normalizeOperationalBucketKey,
 } from '@/app/config/operational-buckets';
import {
  buildKpiBucketFilterSql,
  type KpiBucketKey,
} from '@/app/libs/services/kpi-bucket-sql';
import {
  buildAnomalyBucketWhere,
  buildOperationalBucketWhere,
  buildRegulerJenis1Where,
} from './ticket-buckets';
import { format, toZonedTime } from 'date-fns-tz';
import { toWibString, toWibDateString, todayWibDateForDb, getTodayWibRange } from '@/lib/timezone';
import { resolveEffectiveFlagging } from '../flagging-manja';
import { normalizeSearchInput, type SearchType } from '@/lib/search-intent';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

type BucketSummary = {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
};

type BucketSummaryMap = Record<
  'kpi_customer' | 'kpi_proactive' | 'non_kpi_unspec' | 'non_technical' | 'sqm_update' | 'obsolete',
  BucketSummary
>;

type BucketSummaryScope = 'all' | 'b2c' | 'b2b';

type BucketSummaryMatrix = Record<BucketSummaryScope, BucketSummaryMap>;

const KPI_SUMMARY_BUCKETS = [
  'kpi_customer',
  'kpi_proactive',
  'non_kpi_unspec',
  'non_technical',
  'sqm_update',
  'obsolete',
] as const;

type TicketFilters = {
  search?: string;
  symptom?: string;
  excludeSymptom?: string;
  searchType?: SearchType;
  statusUpdate?: string | string[];
  ticketStatus?: string | string[];
  dept?: string;
  ticketType?: string | string[];
  ticketGroup?: string | string[];
  operationalBucket?: string | string[];
  regulerOnly?: boolean;
  anomalyBucket?: string | string[];
  flagging?: string | string[];
  workzone?: number | string;
  ctype?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  validasiPage?: number;
  validasiLimit?: number;
  includeValidasi?: boolean;
  includeSummary?: boolean;
  includeOptions?: boolean;
  globalScope?: boolean;
  sort?: 'asc' | 'desc';
};

type TicketTypeOption = {
  key: string;
  label: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
};

type FlaggingSummary = {
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
};

function normalizeStatusUpdateFilter(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeStringList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== 'all');
}

function normalizeTicketStatusFilter(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function buildTicketSearchWhere(
  search: string,
  searchType?: SearchType,
): Record<string, any> | null {
  const term = normalizeSearchInput(search);
  if (!term) return null;

  const isNumericLike = /^[\d\s+().-]+$/.test(term);
  const compactNumber = term.replace(/[^\d]/g, '');

  if (searchType === 'service' || (isNumericLike && compactNumber.length >= 4)) {
    return {
      OR: [
        { service_no: { equals: compactNumber } },
        { service_no: { startsWith: compactNumber } },
        { contact_phone: { startsWith: compactNumber } },
      ],
    };
  }

  const isTicketCodeLike = /^[a-z0-9_-]{3,}$/i.test(term) && !term.includes(' ');
  if (searchType === 'ticket_code' || isTicketCodeLike) {
    return {
      OR: [
        { incident: { equals: term } },
        { incident: { startsWith: term } },
        { ticket_id_gamas: { equals: term } },
        { ticket_id_gamas: { startsWith: term } },
      ],
    };
  }

  if (term.length >= 3) {
    return {
      OR: [
        { contact_name: { contains: term } },
        { customer_name: { contains: term } },
      ],
    };
  }

  return { incident: { equals: term } };
}

/**
 * Status filter helper
 */
function applyStatusUpdateWhere(
  where: Record<string, any>,
  statusUpdate?: string | string[],
) {
  const statuses = normalizeStringList(statusUpdate).map((item) =>
    normalizeStatusUpdateFilter(item),
  );

  if (statuses.length === 0) return;

  const clauses = statuses.map((status) => {
    if (status === 'open') {
      return { OR: [{ status_update: null }, { status_update: 'open' }] };
    }
    return { status_update: status };
  });

  if (clauses.length === 1) {
    where.AND = [...(where.AND ?? []), clauses[0]];
    return;
  }

  where.AND = [...(where.AND ?? []), { OR: clauses }];
}

function applyTicketStatusWhere(
  where: Record<string, any>,
  ticketStatus?: string | string[],
) {
  const statuses = normalizeStringList(ticketStatus).map((item) =>
    normalizeTicketStatusFilter(item),
  );

  if (statuses.length === 0) return;

  where.AND = [
    ...(where.AND ?? []),
    {
      status: { in: statuses },
    },
  ];
}

function applyTicketTypeWhere(
  where: Record<string, any>,
  ticketType?: string | string[],
) {
  const ticketTypes = normalizeStringList(ticketType);
  if (ticketTypes.length === 0) return;

  const variants = new Set<string>();
  const clauses: Record<string, any>[] = [];
  for (const type of ticketTypes) {
    if (type === '__blank__') {
      clauses.push({ OR: [{ jenis_tiket_2: null }, { jenis_tiket_2: '' }] });
      continue;
    }

    const clause = getJenisWhereClause(type);
    for (const value of clause.jenis_tiket_2.in) {
      variants.add(value);
    }
  }

  if (variants.size > 0) {
    clauses.push({ jenis_tiket_2: { in: [...variants] } });
  }

  if (clauses.length === 0) return;

  where.AND = [
    ...(where.AND ?? []),
    clauses.length === 1 ? clauses[0] : { OR: clauses },
  ];
}

function applyTicketGroupWhere(
  where: Record<string, any>,
  ticketGroup?: string | string[],
) {
  const groupKeys = normalizeStringList(ticketGroup).map((item) =>
    item.trim().toLowerCase(),
  );
  if (groupKeys.length === 0) return;

  const variants = new Set<string>();
  for (const key of groupKeys) {
    const config = JENIS_MAP.get(key);
    variants.add(key);
    variants.add(key.replace(/-/g, ' '));
    variants.add(key.replace(/-/g, '_'));

    if (!config) continue;

    variants.add(config.label);
    variants.add(config.label.toLowerCase());
    variants.add(config.label.toUpperCase());

    for (const alias of config.dbAliases) {
      variants.add(alias);
      variants.add(String(alias).toLowerCase());
      variants.add(String(alias).toUpperCase());
    }
  }

  where.AND = [
    ...(where.AND ?? []),
    { jenis_tiket_1: { in: [...variants].filter(Boolean) } },
  ];
}

function applyFlaggingWhere(
  where: Record<string, any>,
  flagging?: string | string[],
) {
  const flags = normalizeStringList(flagging).map((item) => item.toUpperCase());
  if (flags.length === 0) return;

  const clauses: Record<string, any>[] = [];
  if (flags.includes('P1')) clauses.push({ flagging_manja: 'P1' });
  if (flags.includes('P+')) clauses.push({ flagging_manja: 'P+' });
  if (flags.includes('FFG')) clauses.push({ guarantee_status: 'guarantee' });
  if (flags.includes('GAMAS')) {
    clauses.push({
      AND: [
        { ticket_id_gamas: { not: null } },
        { ticket_id_gamas: { not: '' } },
        { ticket_id_gamas: { not: '-' } },
        { ticket_id_gamas: { not: '--' } },
      ],
    });
  }

  if (clauses.length === 0) return;
  where.AND = [
    ...(where.AND ?? []),
    clauses.length === 1 ? clauses[0] : { OR: clauses },
  ];
}

function applyOperationalBucketFilterWhere(
  where: Record<string, any>,
  operationalBucket?: string | string[],
) {
  const values = normalizeStringList(operationalBucket)
    .map((item) => normalizeOperationalBucketKey(item))
    .filter((item): item is OperationalBucketKey => item !== '');

  if (values.length === 0) return;

  const clauses = values.map((value) => buildOperationalBucketWhere(value));

  where.AND = [
    ...(where.AND ?? []),
    clauses.length === 1 ? clauses[0] : { OR: clauses },
  ];
}

function applyRegulerOnlyWhere(
  where: Record<string, any>,
  regulerOnly?: boolean,
) {
  if (!regulerOnly) return;
  where.AND = [...(where.AND ?? []), buildRegulerJenis1Where()];
}

function applyAnomalyBucketFilterWhere(
  where: Record<string, any>,
  anomalyBucket?: string | string[],
) {
  const values = normalizeStringList(anomalyBucket)
    .map((item) => normalizeAnomalyBucketKey(item))
    .filter((item): item is AnomalyBucketKey => item !== '');

  if (values.length === 0) return;

  const clauses = values.map((value) => buildAnomalyBucketWhere(value));
  where.AND = [
    ...(where.AND ?? []),
    clauses.length === 1 ? clauses[0] : { OR: clauses },
  ];
}

function buildDeptSegmentWhere(dept?: string): Record<string, unknown> | null {
  if (!dept || dept === 'all') return null;
  if (dept === 'b2c') return { customer_segment: { in: ['DCS', 'PL-TSEL'] } };
  if (dept === 'b2b') {
    return {
      OR: [
        { customer_segment: { notIn: ['DCS', 'PL-TSEL'] } },
        { customer_segment: null },
      ],
    };
  }
  return null;
}

/**
 * Ticket mapper
 */

function mapTicket(t: any) {
  return {
    idTicket: t.id_ticket,
    ticket: t.incident,
    summary: t.summary,
    reportedDate: toWibString(t.reported_date),
    ownerGroup: t.owner_group,
    serviceType: t.service_type,
    customerType: t.customer_type,
    ctype: t.customer_type || undefined,
    serviceNo: t.service_no,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    deviceName: t.device_name,
    status: t.status,
    status_update: (() => {
      const v = String(t.status_update ?? '')
        .trim()
        .toLowerCase();
      return v || null;
    })(),
    hasilVisit: t.status_update,
    bookingDate: toWibString(t.booking_date),
    symptom: t.symptom,
    descriptionActualSolution: t.description_actual_solution,
    descriptionSolutionDompis: t.description_solution_dompis,
    workzone: t.workzone,
    customerSegment: t.customer_segment,
    sourceTicket: t.source_ticket,
    jenisTiket: t.jenis_tiket_2,
    jenisTiket1: t.jenis_tiket_1,
    flaggingManja: resolveEffectiveFlagging(t.flagging_manja, t.booking_date),
    ticketIdGamas: t.ticket_id_gamas ?? null,
    guaranteeStatus: t.guarantee_status,
    pendingDompis: t.pending_dompis,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.alamat,
    closedAt: toWibString(t.closed_at),
    technicianName: t.users?.nama,
    worklogSummary: t.worklog_summary,
    syncDate: toWibDateString(t.sync_date),
    syncedAt: toWibString(t.synced_at),
    importBatch: t.import_batch,
  };
}

function isMissingIndexError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? '');
  return message.includes('Code: `1176`') || /doesn't exist in table/i.test(message);
}

function buildSqlWhereClause(baseWhere: Prisma.ticketWhereInput): [string, any[]] {
  const conditions: string[] = [];
  const params: any[] = [];

  function walk(node: any, parentOp: 'AND' | 'OR' = 'AND') {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      const childConditions = node
        .map((item) => {
          const localConditions: string[] = [];
          const originalPush = conditions.push;
          conditions.push = ((condition: string) => {
            localConditions.push(condition);
            return localConditions.length;
          }) as typeof conditions.push;
          walk(item, parentOp);
          conditions.push = originalPush;
          if (localConditions.length === 0) return null;
          return localConditions.length > 1
            ? `(${localConditions.join(` ${parentOp} `)})`
            : localConditions[0];
        })
        .filter(Boolean) as string[];

      if (childConditions.length > 0) {
        conditions.push(
          childConditions.length > 1
            ? `(${childConditions.join(` ${parentOp} `)})`
            : childConditions[0],
        );
      }
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'AND' && Array.isArray(value)) {
        const childConditions: string[] = [];
        const originalPush = conditions.push;
        conditions.push = ((condition: string) => {
          childConditions.push(condition);
          return childConditions.length;
        }) as typeof conditions.push;
        for (const item of value) walk(item, 'AND');
        conditions.push = originalPush;
        if (childConditions.length > 0) {
          conditions.push(`(${childConditions.join(' AND ')})`);
        }
        continue;
      }

      if (key === 'OR' && Array.isArray(value)) {
        const childConditions: string[] = [];
        const originalPush = conditions.push;
        conditions.push = ((condition: string) => {
          childConditions.push(condition);
          return childConditions.length;
        }) as typeof conditions.push;
        for (const item of value) walk(item, 'OR');
        conditions.push = originalPush;
        if (childConditions.length > 0) {
          conditions.push(`(${childConditions.join(' OR ')})`);
        }
        continue;
      }

      if (key === 'NOT') {
        const values = Array.isArray(value) ? value : [value];
        const childConditions: string[] = [];
        const originalPush = conditions.push;
        conditions.push = ((condition: string) => {
          childConditions.push(condition);
          return childConditions.length;
        }) as typeof conditions.push;
        for (const item of values) walk(item, 'AND');
        conditions.push = originalPush;
        if (childConditions.length > 0) {
          const joined = childConditions.join(' AND ');
          conditions.push(`NOT (${joined})`);
        }
        continue;
      }

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const operator = value as Record<string, any>;

        if (operator.in !== undefined && Array.isArray(operator.in)) {
          const placeholders = operator.in.map(() => '?');
          conditions.push(`\`${key}\` IN (${placeholders.join(',')})`);
          params.push(...operator.in);
          continue;
        }

        if (operator.notIn !== undefined && Array.isArray(operator.notIn)) {
          if (operator.notIn.length === 0) continue;
          const placeholders = operator.notIn.map(() => '?');
          conditions.push(`\`${key}\` NOT IN (${placeholders.join(',')})`);
          params.push(...operator.notIn);
          continue;
        }

        if (operator.not !== undefined) {
          if (operator.not === null) {
            conditions.push(`\`${key}\` IS NOT NULL`);
          } else {
            conditions.push(`\`${key}\` != ?`);
            params.push(operator.not);
          }
          continue;
        }

        if (operator.gte !== undefined) {
          conditions.push(`\`${key}\` >= ?`);
          params.push(operator.gte);
          continue;
        }

        if (operator.lte !== undefined) {
          conditions.push(`\`${key}\` <= ?`);
          params.push(operator.lte);
          continue;
        }

        if (operator.contains !== undefined) {
          conditions.push(`\`${key}\` LIKE ?`);
          params.push(`%${operator.contains}%`);
          continue;
        }

        if (operator.startsWith !== undefined) {
          conditions.push(`\`${key}\` LIKE ?`);
          params.push(`${operator.startsWith}%`);
          continue;
        }

        if (operator.equals !== undefined) {
          conditions.push(`\`${key}\` = ?`);
          params.push(operator.equals);
          continue;
        }
      }

      if (value === null) {
        conditions.push(`\`${key}\` IS NULL`);
      } else {
        conditions.push(`\`${key}\` = ?`);
        params.push(value);
      }
    }
  }

  walk(baseWhere);
  return [conditions.length > 0 ? conditions.join(' AND ') : '1=1', params];
}

function parseCountValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeBucketRows(
  rows: Array<{
    status: string | null;
    status_update: string | null;
    guarantee_status: string | null;
    ticket_id_gamas: string | null;
    flagging_manja: string | null;
  }>,
): BucketSummary {
  const summary: BucketSummary = {
    total: rows.length,
    open: 0,
    assigned: 0,
    onProgress: 0,
    pending: 0,
    close: 0,
    ffgCount: 0,
    gamasCount: 0,
    p1Count: 0,
    pPlusCount: 0,
  };

  for (const row of rows) {
    const status = String(row.status ?? '').trim().toUpperCase();
    const statusUpdate = String(row.status_update ?? '').trim().toLowerCase();

    if (CLOSE_STATUS_VALUES.includes(status)) {
      summary.close += 1;
    } else if (statusUpdate === 'assigned') {
      summary.assigned += 1;
    } else if (statusUpdate === 'on_progress') {
      summary.onProgress += 1;
    } else if (statusUpdate === 'pending') {
      summary.pending += 1;
    } else {
      summary.open += 1;
    }

    if (String(row.guarantee_status ?? '').trim().toLowerCase() === 'guarantee') {
      summary.ffgCount += 1;
    }

    const gamas = String(row.ticket_id_gamas ?? '').trim().toLowerCase();
    if (gamas && !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(gamas)) {
      summary.gamasCount += 1;
    }

    if (String(row.flagging_manja ?? '').trim().toUpperCase() === 'P1') {
      summary.p1Count += 1;
    }

    if (String(row.flagging_manja ?? '').trim().toUpperCase() === 'P+') {
      summary.pPlusCount += 1;
    }
  }

  return summary;
}

function buildStatusCategorySql(tbl = ''): string {
  const t = tbl ? `${tbl}.` : '';
  const closeStatusesSql = CLOSE_STATUS_VALUES.map((status) =>
    `'${status.replace(/'/g, "''")}'`,
  ).join(', ');

  return `
    CASE
      WHEN UPPER(TRIM(COALESCE(${t}status, ''))) IN (${closeStatusesSql}) THEN 'close'
      WHEN LOWER(TRIM(COALESCE(${t}status_update, ''))) = 'assigned' THEN 'assigned'
      WHEN LOWER(TRIM(COALESCE(${t}status_update, ''))) = 'on_progress' THEN 'on_progress'
      WHEN LOWER(TRIM(COALESCE(${t}status_update, ''))) = 'pending' THEN 'pending'
      ELSE 'open'
    END
  `;
}

function buildBucketSummarySelect(bucket: KpiBucketKey, tbl = ''): string {
  const t = tbl ? `${tbl}.` : '';
  const bucketSql = buildKpiBucketFilterSql(bucket, tbl);
  const statusCategorySql = buildStatusCategorySql(tbl);
  const prefix = `${bucket}`;

  return [
    `SUM(CASE WHEN (${bucketSql}) THEN 1 ELSE 0 END) AS \`${prefix}__total\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${statusCategorySql} = 'open' THEN 1 ELSE 0 END) AS \`${prefix}__open\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${statusCategorySql} = 'assigned' THEN 1 ELSE 0 END) AS \`${prefix}__assigned\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${statusCategorySql} = 'on_progress' THEN 1 ELSE 0 END) AS \`${prefix}__on_progress\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${statusCategorySql} = 'pending' THEN 1 ELSE 0 END) AS \`${prefix}__pending\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${statusCategorySql} = 'close' THEN 1 ELSE 0 END) AS \`${prefix}__close\``,
    `SUM(CASE WHEN (${bucketSql}) AND LOWER(COALESCE(${t}guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS \`${prefix}__ffg\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${t}ticket_id_gamas IS NOT NULL AND LOWER(TRIM(${t}ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS \`${prefix}__gamas\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${t}flagging_manja = 'P1' THEN 1 ELSE 0 END) AS \`${prefix}__p1\``,
    `SUM(CASE WHEN (${bucketSql}) AND ${t}flagging_manja = 'P+' THEN 1 ELSE 0 END) AS \`${prefix}__p_plus\``,
  ].join(',\n');
}

function normalizeBucketSummaryRow(row: Record<string, unknown> | undefined, bucket: KpiBucketKey): BucketSummary {
  return {
    total: parseCountValue(row?.[`${bucket}__total`]),
    open: parseCountValue(row?.[`${bucket}__open`]),
    assigned: parseCountValue(row?.[`${bucket}__assigned`]),
    onProgress: parseCountValue(row?.[`${bucket}__on_progress`]),
    pending: parseCountValue(row?.[`${bucket}__pending`]),
    close: parseCountValue(row?.[`${bucket}__close`]),
    ffgCount: parseCountValue(row?.[`${bucket}__ffg`]),
    gamasCount: parseCountValue(row?.[`${bucket}__gamas`]),
    p1Count: parseCountValue(row?.[`${bucket}__p1`]),
    pPlusCount: parseCountValue(row?.[`${bucket}__p_plus`]),
  };
}

async function hydrateTicketsByIds(ids: number[]) {
  if (ids.length === 0) return [];

  const tickets = await prisma.ticket.findMany({
    where: { id_ticket: { in: ids } },
    include: {
      users: {
        select: { nama: true },
      },
    },
  });

  const ticketMap = new Map(tickets.map((ticket) => [ticket.id_ticket, ticket]));
  return ids
    .map((id) => ticketMap.get(id))
    .filter(Boolean);
}

async function queryRawWithOptionalIndex<T>(
  sqlWithIndex: string,
  sqlWithoutIndex: string,
  params: unknown[],
): Promise<T> {
  try {
    return await prisma.$queryRawUnsafe<T>(sqlWithIndex, ...params);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    console.warn('[DailyTicketService] FORCE INDEX skipped:', String((error as Error)?.message ?? error));
    return prisma.$queryRawUnsafe<T>(sqlWithoutIndex, ...params);
  }
}

function buildMainTableOrderBySql(sort: 'asc' | 'desc', today: string): [string, any[]] {
  const reportedDirection = sort === 'asc' ? 'ASC' : 'DESC';

  return [
    `
      CASE
        WHEN booking_date IS NOT NULL AND DATE(booking_date) = ? THEN 0
        WHEN UPPER(COALESCE(flagging_manja, '')) = 'P1' THEN 1
        ELSE 2
      END ASC,
      CASE
        WHEN UPPER(COALESCE(customer_type, '')) IN ('HVC_DIAMOND', 'HVC DIAMOND', 'DIAMOND') THEN 0
        WHEN UPPER(COALESCE(customer_type, '')) IN ('HVC_PLATINUM', 'HVC PLATINUM', 'PLATINUM') THEN 1
        WHEN UPPER(COALESCE(customer_type, '')) IN ('HVC_GOLD', 'HVC GOLD', 'GOLD') THEN 2
        WHEN UPPER(COALESCE(customer_type, '')) IN ('REGULER', 'REGULAR') THEN 3
        ELSE 4
      END ASC,
      CASE
        WHEN booking_date IS NULL THEN 1
        ELSE 0
      END ASC,
      booking_date ASC,
      reported_date ${reportedDirection},
      id_ticket ASC
    `,
    [today],
  ];
}

export class DailyTicketService {
  /**
   * Get latest operational sync_date from DB
   */
  private static async getLatestSyncDate(
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
  static async applyDailyTicketFilter(
    where: Record<string, any>,
    tx?: Prisma.TransactionClient,
  ) {
    const today = todayWibDateForDb();
    const { start: todayStart } = getTodayWibRange();
    
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          // Active tickets synced today (not closed)
          {
            AND: [
              { sync_date: today },
              { status: { not: 'closed' } },
            ],
          },
          // Tickets closed today (closed_at >= today start in WIB)
          {
            AND: [
              { sync_date: today },
              { status: 'closed' },
              { closed_at: { gte: todayStart } },
            ],
          },
          // Tickets with status_update = 'close' AND status = 'closed' synced today
          // (newly closed via Dompis workflow, visible today then gone tomorrow)
          {
            AND: [
              { sync_date: today },
              { status_update: 'close' },
              { status: 'closed' },
            ],
          },
          // Carry-over with pending_dompis (not yet closed)
          {
            AND: [
              { pending_dompis: { not: null } },
              { pending_dompis: { not: '' } },
              { status: { not: 'closed' } },
            ],
          },
        ],
      },
    ];
  }

  /**
   * Workzone filter
   */

  private static async buildWorkzoneWhere(
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

  private static async resolveSelectedWorkzone(
    saId?: number | string,
  ): Promise<string | null> {
    const id = Number(saId);

    if (!Number.isFinite(id) || id <= 0) return null;

    return resolveWorkzoneName(id);
  }

  static async buildDailyTicketWhere(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<Record<string, any>> {
    const {
      search = '',
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
      startDate,
      endDate,
      ctype,
      searchType,
      globalScope,
    } = filters ?? {};

    const selectedWorkzone = await this.resolveSelectedWorkzone(workzone);
    const effectiveRole =
      globalScope && (role === 'admin' || role === 'superadmin' || role === 'super_admin')
        ? 'superadmin'
        : role;

    const where: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(effectiveRole, userId, selectedWorkzone)),
    };

    await this.applyDailyTicketFilter(where);

    const searchWhere = buildTicketSearchWhere(search, searchType);
    if (searchWhere) {
      where.AND = [
        ...(where.AND ?? []),
        searchWhere,
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

    return where;
  }

  private static async fetchTicketIdsBySql(
    where: Prisma.ticketWhereInput,
    options: {
      sort: 'asc' | 'desc';
      offset: number;
      limit: number;
      forceIndex: 'idx_ticket_daily_board' | 'idx_ticket_daily_validasi';
      priorityToday?: string | null;
    },
  ): Promise<number[]> {
    const [whereClause, params] = buildSqlWhereClause(where);
    const [orderByClause, orderParams] = options.priorityToday
      ? buildMainTableOrderBySql(options.sort, options.priorityToday)
      : [
          `reported_date ${options.sort === 'asc' ? 'ASC' : 'DESC'}, id_ticket ASC`,
          [],
        ];
    const sqlWithIndex = `
      SELECT id_ticket
      FROM ticket FORCE INDEX (${options.forceIndex})
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ?, ?
    `;
    const sqlWithoutIndex = `
      SELECT id_ticket
      FROM ticket
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ?, ?
    `;

    const rows = await queryRawWithOptionalIndex<Array<{ id_ticket: number }>>(
      sqlWithIndex,
      sqlWithoutIndex,
      [...params, ...orderParams, options.offset, options.limit],
    );

    return rows.map((row) => row.id_ticket);
  }

  private static async countTicketsBySql(
    where: Prisma.ticketWhereInput,
    forceIndex: 'idx_ticket_daily_board' | 'idx_ticket_daily_validasi',
  ): Promise<number> {
    const [whereClause, params] = buildSqlWhereClause(where);
    const sqlWithIndex = `
      SELECT COUNT(*) AS total
      FROM ticket FORCE INDEX (${forceIndex})
      WHERE ${whereClause}
    `;
    const sqlWithoutIndex = `
      SELECT COUNT(*) AS total
      FROM ticket
      WHERE ${whereClause}
    `;

    const rows = await queryRawWithOptionalIndex<Array<{ total: bigint | number }>>(
      sqlWithIndex,
      sqlWithoutIndex,
      params,
    );

    return Number(rows[0]?.total ?? 0);
  }

  private static buildValidasiCondition(): Prisma.ticketWhereInput {
    return {
      status: { notIn: [...CLOSE_STATUS_VALUES] },
      OR: [
        { worklog_summary: { contains: 'Tech Closed' } },
        { status_update: 'close' },
      ],
    };
  }

  private static buildValidasiBaseWhere(
    where: Record<string, any>,
  ): Prisma.ticketWhereInput | null {
    return {
      ...where,
      AND: [
        ...(where.AND ?? []),
        this.buildValidasiCondition(),
      ],
    };
  }

  private static buildMainTableWhere(
    where: Record<string, any>,
  ): Prisma.ticketWhereInput {
    return {
      ...where,
      AND: [
        ...(where.AND ?? []),
        { NOT: this.buildValidasiCondition() },
      ],
    };
  }

  private static withAdditionalWhere(
    where: Prisma.ticketWhereInput,
    ...clauses: Prisma.ticketWhereInput[]
  ): Prisma.ticketWhereInput {
    const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
    if (activeClauses.length === 0) return where;
    return {
      AND: [where, ...activeClauses],
    };
  }

  private static async countValidasiTickets(
    validasiBaseWhere: Prisma.ticketWhereInput,
  ): Promise<number> {
    const [sql, params] = buildSqlWhereClause(validasiBaseWhere);
    const sqlWithIndex = `
      SELECT COUNT(*) AS total
      FROM ticket FORCE INDEX (idx_ticket_daily_validasi)
      WHERE ${sql}
    `;
    const sqlWithoutIndex = `
      SELECT COUNT(*) AS total
      FROM ticket
      WHERE ${sql}
    `;

    const rows = await queryRawWithOptionalIndex<Array<{ total: bigint | number }>>(
      sqlWithIndex,
      sqlWithoutIndex,
      params,
    );

    return Number(rows[0]?.total ?? 0);
  }

  private static normalizeFlaggingSummary(row?: Record<string, unknown>): FlaggingSummary {
    return {
      ffgCount: Number(row?.ffg ?? 0),
      gamasCount: Number(row?.gamas ?? 0),
      p1Count: Number(row?.p1 ?? 0),
      pPlusCount: Number(row?.p_plus ?? 0),
    };
  }

  private static async countFlaggingSummary(
    mainTableWhere: Prisma.ticketWhereInput,
    validasiBaseWhere?: Prisma.ticketWhereInput | null,
  ): Promise<FlaggingSummary> {
    const [mainSql, mainParams] = buildSqlWhereClause(mainTableWhere);
    const mainWithIndex = `
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
        SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND LOWER(TRIM(ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
        SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
        SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
      FROM ticket FORCE INDEX (idx_ticket_daily_board)
      WHERE ${mainSql}
    `;
    const mainWithoutIndex = `
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
        SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND LOWER(TRIM(ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
        SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
        SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
      FROM ticket
      WHERE ${mainSql}
    `;

    const [mainRows, validasiRows] = await Promise.all([
      queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
        mainWithIndex,
        mainWithoutIndex,
        mainParams,
      ),
      validasiBaseWhere
        ? this.countValidasiFlaggingSummary(validasiBaseWhere)
        : Promise.resolve([{ ffg: 0, gamas: 0, p1: 0, p_plus: 0 }]),
    ]);

    const main = this.normalizeFlaggingSummary(mainRows[0]);
    const validasi = this.normalizeFlaggingSummary(validasiRows[0]);

    return {
      ffgCount: main.ffgCount + validasi.ffgCount,
      gamasCount: main.gamasCount + validasi.gamasCount,
      p1Count: main.p1Count + validasi.p1Count,
      pPlusCount: main.pPlusCount + validasi.pPlusCount,
    };
  }

  private static async countValidasiFlaggingSummary(
    validasiBaseWhere: Prisma.ticketWhereInput,
  ): Promise<Array<Record<string, unknown>>> {
    const [sql, params] = buildSqlWhereClause(validasiBaseWhere);
    const sqlWithIndex = `
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(t.guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
        SUM(CASE WHEN t.ticket_id_gamas IS NOT NULL AND LOWER(TRIM(t.ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
        SUM(CASE WHEN t.flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
        SUM(CASE WHEN t.flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
      FROM ticket t FORCE INDEX (idx_ticket_daily_validasi)
      WHERE ${sql}
    `;
    const sqlWithoutIndex = `
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(t.guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
        SUM(CASE WHEN t.ticket_id_gamas IS NOT NULL AND LOWER(TRIM(t.ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
        SUM(CASE WHEN t.flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
        SUM(CASE WHEN t.flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
      FROM ticket t
      WHERE ${sql}
    `;

    return queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
      sqlWithIndex,
      sqlWithoutIndex,
      params,
    );
  }

  private static async fetchValidasiTicketIds(
    validasiBaseWhere: Prisma.ticketWhereInput,
    options: { sort: 'asc' | 'desc'; offset: number; limit: number },
  ): Promise<number[]> {
    const [sql, params] = buildSqlWhereClause(validasiBaseWhere);
    const sqlWithIndex = `
      SELECT id_ticket, reported_date
      FROM ticket FORCE INDEX (idx_ticket_daily_validasi)
      WHERE ${sql}
      ORDER BY reported_date ${options.sort === 'asc' ? 'ASC' : 'DESC'}, id_ticket ASC
      LIMIT ?, ?
    `;
    const sqlWithoutIndex = `
      SELECT id_ticket, reported_date
      FROM ticket
      WHERE ${sql}
      ORDER BY reported_date ${options.sort === 'asc' ? 'ASC' : 'DESC'}, id_ticket ASC
      LIMIT ?, ?
    `;

    const rows = await queryRawWithOptionalIndex<Array<{ id_ticket: number }>>(
      sqlWithIndex,
      sqlWithoutIndex,
      [...params, options.offset, options.limit],
    );

    return rows.map((row) => row.id_ticket);
  }

  /**
   * Optimized Status Counter
   *
   * Replaces 6 COUNT queries
   */

  static async countStatuses(where: Record<string, any>) {
    const grouped = await prisma.ticket.groupBy({
      by: ['status', 'status_update'],
      where,
      _count: { _all: true },
    });

    const stats: any = {
      total: 0,
      open: 0,
      assigned: 0,
      onProgress: 0,
      pending: 0,
      close: 0,
    };

    for (const g of grouped) {
      const count = g._count._all;
      stats.total += count;

      const statusVal = (g.status ?? '').trim().toUpperCase();
      const su = (g.status_update ?? '').trim().toLowerCase();

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

  static async getTicketStatusOptions(
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

  static async getTicketTypeOptions(
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

  static async getDailyTicketTable(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const { page = 1, limit = 10, sort = 'desc' } = filters ?? {};
    const includeValidasi = filters?.includeValidasi !== false;
    const includeSummary = filters?.includeSummary !== false;
    const includeOptions = filters?.includeOptions !== false;
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

    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const statusOptionsWhere = includeOptions
      ? await this.buildDailyTicketWhere(role, userId, {
          ...filters,
          ticketStatus: undefined,
        })
      : null;
    const ticketTypeOptionsWhere = includeOptions
      ? await this.buildDailyTicketWhere(role, userId, {
          ...filters,
          ticketType: undefined,
        })
      : null;

    const mainTableWhere = this.buildMainTableWhere(where);
    const validasiBaseWhere = includeValidasi
      ? this.buildValidasiBaseWhere(where)
      : null;
    const ticketIdsPromise = this.fetchTicketIdsBySql(mainTableWhere, {
      sort,
      offset,
      limit: safeLimit,
      forceIndex: 'idx_ticket_daily_board',
      priorityToday: toWibDateString(todayWibDateForDb()),
    });
    const validasiTicketIdsPromise = includeValidasi && validasiBaseWhere
      ? this.fetchValidasiTicketIds(validasiBaseWhere, {
          sort,
          offset: validasiOffset,
          limit: safeValidasiLimit,
        })
      : Promise.resolve([] as number[]);
    const summaryPromise = includeSummary
      ? this.countStatuses(mainTableWhere)
      : Promise.resolve({
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
          unassigned: 0,
        });
    const flaggingSummaryPromise = includeSummary
      ? this.countFlaggingSummary(mainTableWhere, validasiBaseWhere)
      : Promise.resolve({
          ffgCount: 0,
          gamasCount: 0,
          p1Count: 0,
          pPlusCount: 0,
        });
    const validasiCountPromise = includeValidasi && validasiBaseWhere
      ? this.countValidasiTickets(validasiBaseWhere)
      : Promise.resolve(0);
    const statusOptionsPromise = includeOptions
      ? this.getTicketStatusOptions(statusOptionsWhere ?? where)
      : Promise.resolve([] as string[]);
    const ticketTypeOptionsPromise = includeOptions
      ? this.getTicketTypeOptions(
          this.buildMainTableWhere(ticketTypeOptionsWhere ?? where),
          includeValidasi && validasiBaseWhere && ticketTypeOptionsWhere
            ? this.buildValidasiBaseWhere(ticketTypeOptionsWhere)
            : null,
        )
      : Promise.resolve([] as TicketTypeOption[]);
    const totalPromise = this.countTicketsBySql(
      mainTableWhere,
      'idx_ticket_daily_board',
    );

    const [
      total,
      summary,
      flaggingSummary,
      validasiCount,
      ticketIds,
      validasiTicketIds,
      statusOptions,
      ticketTypeOptions,
    ] = await Promise.all([
      totalPromise,
      summaryPromise,
      flaggingSummaryPromise,
      validasiCountPromise,
      ticketIdsPromise,
      validasiTicketIdsPromise,
      statusOptionsPromise,
      ticketTypeOptionsPromise,
    ]);

    const [tickets, validasiTickets] = await Promise.all([
      hydrateTicketsByIds(ticketIds),
      hydrateTicketsByIds(validasiTicketIds),
    ]);

    return {
      total,
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
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      statusOptions,
      ticketTypeOptions,
      data: tickets.map(mapTicket),
      validasiCount: validasiCount,
      validasiPage: safeValidasiPage,
      validasiLimit: safeValidasiLimit,
      validasiTotalPages: Math.ceil(validasiCount / safeValidasiLimit),
      validasiTickets: validasiTickets.map(mapTicket),
    };
  }

  static async getDailyTicketIds(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<number[]> {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where);
    const [whereClause, params] = buildSqlWhereClause(mainTableWhere);
    const rows = await queryRawWithOptionalIndex<Array<{ id_ticket: number }>>(
      `SELECT id_ticket FROM ticket FORCE INDEX (idx_ticket_daily_board) WHERE ${whereClause}`,
      `SELECT id_ticket FROM ticket WHERE ${whereClause}`,
      params,
    );
    return rows.map((row) => row.id_ticket);
  }

  static async buildDailyTicketSqlParams(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<[string, any[]]> {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where);
    return buildSqlWhereClause(mainTableWhere);
  }

  static async getDailyTicketSummary(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where);
    const validasiBaseWhere = this.buildValidasiBaseWhere(where);

    const [total, summary, flaggingSummary] = await Promise.all([
      this.countTicketsBySql(mainTableWhere, 'idx_ticket_daily_board'),
      this.countStatuses(mainTableWhere),
      this.countFlaggingSummary(mainTableWhere, validasiBaseWhere),
    ]);

    return {
      total,
      open: summary.open,
      assigned:
        (summary.assigned ?? 0) +
        (summary.onProgress ?? 0) +
        (summary.pending ?? 0),
      close: summary.close,
      ...flaggingSummary,
    };
  }

  static async getKpiBucketSummaryMatrix(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<BucketSummaryMatrix> {
    const buildScopeSummary = async (
      dept: BucketSummaryScope,
    ): Promise<BucketSummaryMap> => {
      const where = await this.buildDailyTicketWhere(role, userId, {
        ...filters,
        dept,
        operationalBucket: undefined,
      });

      const summary = {} as BucketSummaryMap;
      const mainTableWhere = this.buildMainTableWhere(where);
      for (const bucket of KPI_SUMMARY_BUCKETS) {
        if (bucket === 'kpi_customer' || bucket === 'non_technical') {
          const rows = await prisma.ticket.findMany({
            where: {
              AND: [mainTableWhere, buildOperationalBucketWhere(bucket)],
            },
            select: {
              status: true,
              status_update: true,
              guarantee_status: true,
              ticket_id_gamas: true,
              flagging_manja: true,
            },
          });
          summary[bucket] = summarizeBucketRows(rows);
          continue;
        }

        const [whereClause, params] = buildSqlWhereClause(mainTableWhere);
        const selectSql = buildBucketSummarySelect(bucket);
        const sqlWithIndex = `
          SELECT
            ${selectSql}
          FROM ticket FORCE INDEX (idx_ticket_daily_board)
          WHERE ${whereClause}
        `;
        const sqlWithoutIndex = `
          SELECT
            ${selectSql}
          FROM ticket
          WHERE ${whereClause}
        `;
        const rows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
          sqlWithIndex,
          sqlWithoutIndex,
          params,
        );
        const row = rows[0] ?? {};
        summary[bucket] = normalizeBucketSummaryRow(row, bucket);
      }

      return summary;
    };

    const [all, b2c, b2b] = await Promise.all([
      buildScopeSummary('all'),
      buildScopeSummary('b2c'),
      buildScopeSummary('b2b'),
    ]);

    return { all, b2c, b2b };
  }

  /**
   * Daily Stats
   */

  static async getDailyStats(
    role: string,
    userId: number,
    saId?: number,
    p0?: {
      dept: string | undefined;
      ticketType: string | undefined;
      statusUpdate: string | undefined;
    },
  ) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);

    const where = await this.buildWorkzoneWhere(role, userId, selectedWorkzone);

    await this.applyDailyTicketFilter(where);

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

    const mainTableWhere = this.buildMainTableWhere(where);
    return this.countStatuses(mainTableWhere);
  }

  /**
   * Daily Stats by Service Area
   */

  static async getDailyStatsByServiceArea(
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
    await this.applyDailyTicketFilter(baseWhere);

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

  static async assignToUser(
    ticketId: number,
    teknisiUserId: number,
    actor: ActorContext,
  ) {
    return TicketWorkflowService.assignToUser(ticketId, teknisiUserId, actor);
  }

  static async unassign(ticketId: number, role?: string, userId?: number) {
    if (!role || !userId) {
      throw new Error('Unauthorized');
    }

    return TicketWorkflowService.unassignTicket(ticketId, {
      id_user: userId,
      role,
    });
  }

  static async pickup(ticketId: number, teknisiUserId: number) {
    return TicketWorkflowService.pickupTicket(ticketId, {
      id_user: teknisiUserId,
      role: 'teknisi',
    });
  }

  static async close(
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

  static async getHourlyTicketCounts(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<Array<{ hour: number; count: number }>> {
    const selectedWorkzone = await this.resolveSelectedWorkzone(filters?.workzone);
    const scopedWhere: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(role, userId, selectedWorkzone)),
    };

    const deptSegmentWhere = buildDeptSegmentWhere(filters?.dept);
    if (deptSegmentWhere) {
      scopedWhere.AND = [...(scopedWhere.AND ?? []), deptSegmentWhere];
    }

    const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
    const todayWib = format(wibNow, 'yyyy-MM-dd', { timeZone: 'Asia/Jakarta' });
    const currentHourWib = Number(format(wibNow, 'H', { timeZone: 'Asia/Jakarta' }));
    const yesterdayWib = format(
      new Date(wibNow.getTime() - 86400000),
      'yyyy-MM-dd',
      { timeZone: 'Asia/Jakarta' },
    );

    const fetchRows = (where: Record<string, any>) => {
      const andArray = [
        { reported_date: { not: null } },
        {
          OR: [
            { reported_date: { startsWith: yesterdayWib } },
            { reported_date: { startsWith: todayWib } },
          ],
        },
        ...(where.AND || []),
      ];
      const { AND: _omit, ...rest } = where;
      return prisma.ticket.findMany({
        where: {
          ...rest,
          AND: andArray,
        },
        select: {
          reported_date: true,
        },
      });
    };

    let rows = await fetchRows(scopedWhere);
    if (rows.length === 0) {
      rows = await fetchRows({});
    }

    const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));

    for (const row of rows) {
      const rawReportedDate = row.reported_date?.trim();
      if (!rawReportedDate) continue;

      const parsed = new Date(rawReportedDate);
      if (isNaN(parsed.getTime())) continue;

      const zoned = toZonedTime(parsed, 'Asia/Jakarta');
      const wibDate = format(zoned, 'yyyy-MM-dd', { timeZone: 'Asia/Jakarta' });
      if (wibDate !== todayWib) continue;

      const wibHour = Number(format(zoned, 'H', { timeZone: 'Asia/Jakarta' }));
      if (!Number.isFinite(wibHour) || wibHour < 0 || wibHour > currentHourWib) continue;

      counts[wibHour].count += 1;
    }

    return counts;
  }

  static async getTopSymptoms(
    role: string,
    userId: number,
    limit = 10,
    filters?: TicketFilters,
  ): Promise<Array<{ symptom: string; count: number }>> {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where);
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
      LIMIT ${limit}
    `;
    const rows = await prisma.$queryRawUnsafe<Array<{ symptom_clean: string; count: bigint }>>(sql, ...params);
    return rows.map((r) => ({ symptom: r.symptom_clean, count: Number(r.count) }));
  }
}
