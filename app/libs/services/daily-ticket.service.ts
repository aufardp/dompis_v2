import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';
import { DASHBOARD_CACHE_TTL, getOrSetCache } from '@/lib/cache';

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
import { addHours, startOfDay, startOfHour } from 'date-fns';
import { format, fromZonedTime, toZonedTime } from 'date-fns-tz';
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
  ticketId?: number;
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
  includeValidasiTickets?: boolean;
  includeSummary?: boolean;
  includeOptions?: boolean;
  includeClosed?: boolean;
  globalScope?: boolean;
  gamasOnly?: boolean;
  sort?: 'asc' | 'desc';
  sortField?: string;
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

type TicketManagementBucketSummary = {
  total: number;
  open: number;
  assigned: number;
  close: number;
};

type TicketManagementOverviewSummary = {
  totals: {
    total: number;
    b2c: number;
    b2b: number;
    unassigned: number;
    assigned: number;
    close: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  cards: Record<
    'kpiCustomer' | 'kpiProactive' | 'nonKpiUnspec' | 'nonTechnical' | 'sqmUpdate' | 'obsolete',
    TicketManagementBucketSummary
  >;
};

function normalizeCacheFilterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value]
      .map((item) => normalizeCacheFilterValue(item))
      .sort((a, b) => String(a).localeCompare(String(b)));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, normalizeCacheFilterValue(item)] as const);
    return Object.fromEntries(entries);
  }

  return value ?? null;
}

function buildKpiBucketSummaryCacheKey(
  role: string,
  userId: number,
  filters?: TicketFilters,
): string {
  const normalized = normalizeCacheFilterValue(filters ?? {});
  return `dashboard:kpi_bucket_summary:${role}:${userId}:${JSON.stringify(normalized)}`;
}

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

  const closeStatuses = statuses.filter((status) =>
    CLOSE_STATUS_VALUES.includes(status),
  );
  const nonCloseStatuses = statuses.filter(
    (status) => !CLOSE_STATUS_VALUES.includes(status),
  );

  const clauses: Record<string, any>[] = [];

  if (nonCloseStatuses.length > 0) {
    clauses.push({ status: { in: nonCloseStatuses } });
  }

  if (closeStatuses.length > 0) {
    clauses.push({ status: { in: closeStatuses } });
  }

  if (clauses.length === 1) {
    where.AND = [...(where.AND ?? []), clauses[0]];
    return;
  }

  where.AND = [...(where.AND ?? []), { OR: clauses }];
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
  const { start: todayStart } = getTodayWibRange();
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  if (flags.includes('P1')) clauses.push({ flagging_manja: 'P1' });
  if (flags.includes('P+')) clauses.push({ flagging_manja: 'P+' });
  if (flags.includes('EXPIRED')) {
    clauses.push({
      AND: [
        { booking_date: { lt: yesterdayStart } },
      ],
    });
  }
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
    witel: t.witel,
    customerType: t.customer_type,
    ctype: t.customer_type || undefined,
    serviceNo: t.service_no,
    customerName: t.customer_name,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    channel: t.channel,
    statusDate: t.status_date,
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
    solution: t.solution,
    descriptionActualSolution: t.description_actual_solution,
    descriptionSolutionDompis: t.description_solution_dompis,
    incidentDomain: t.incident_domain,
    classificationFlag: t.classification_flag,
    realm: t.realm,
    tscResult: t.tsc_result,
    sccResult: t.scc_result,
    snOnt: t.sn_ont,
    tipeOnt: t.tipe_ont,
    rkInformation: t.rk_information,
    classificationPath: t.classification_path,
    lapul: t.lapul,
    gaul: t.gaul,
    onuRx: t.onu_rx,
    pendingReason: t.pending_reason,
    sqmUpdateReason: t.sqm_update_reason,
    workzone: t.workzone,
    customerSegment: t.customer_segment,
    sourceTicket: t.source_ticket,
    jenisTiket: t.jenis_tiket_2,
    jenisTiket1: t.jenis_tiket_1,
    flaggingManja: resolveEffectiveFlagging(t.flagging_manja, t.booking_date),
    flaggingDatin: t.flagging_datin,
    hours: t.hours,
    durasiTicket: t.durasi_ticket,
    jamExpired: t.jam_expired,
    manjaExpired: t.manja_expired,
    statusManja: t.status_manja,
    statusTtr12Gold: t.status_ttr_12_gold,
    statusTtr3Diamond: t.status_ttr_3_diamond,
    statusTtr24Reguler: t.status_ttr_24_reguler,
    statusTtr6Platinum: t.status_ttr_6_platinum,
    statusTtrDatinK1: t.status_ttr_datin_k1,
    statusTtrDatinK2: t.status_ttr_datin_k2,
    statusTtrDatinK3: t.status_ttr_datin_k3,
    statusTtrIndibiz4Jam: t.status_ttr_indibiz_4_jam,
    statusTtrReseller6Jam: t.status_ttr_reseller_6_jam,
    statusTtrWifiId: t.status_ttr_wifi_id,
    ticketIdGamas: t.ticket_id_gamas ?? null,
    guaranteeStatus: t.guarantee_status,
    pendingDompis: t.pending_dompis,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.alamat,
    closedAt: toWibString(t.closed_at),
    syncDate: toWibDateString(t.sync_date),
    technicianName: t.users?.nama,
    worklogSummary: t.worklog_summary,
    validationReason: t.validation_reason,
    syncedAt: toWibString(t.synced_at),
    importBatch: t.import_batch,
    importedAt: toWibString(t.imported_at),
  };
}

function isMissingIndexError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? '');
  return message.includes('Code: `1176`') || /doesn't exist in table/i.test(message);
}

export function buildSqlWhereClause(baseWhere: Prisma.ticketWhereInput): [string, any[]] {
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
          } else if (typeof operator.not === 'object' && operator.not.contains !== undefined) {
            conditions.push(`\`${key}\` NOT LIKE ?`);
            params.push(`%${operator.not.contains}%`);
          } else if (typeof operator.not === 'object' && operator.not.startsWith !== undefined) {
            conditions.push(`\`${key}\` NOT LIKE ?`);
            params.push(`${operator.not.startsWith}%`);
          } else if (typeof operator.not === 'object' && operator.not.endsWith !== undefined) {
            conditions.push(`\`${key}\` NOT LIKE ?`);
            params.push(`%${operator.not.endsWith}`);
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
    booking_date: string | null;
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

    const effectiveFlag = resolveEffectiveFlagging(
      String(row.flagging_manja ?? '').trim().toUpperCase(),
      row.booking_date,
    );

    if (effectiveFlag === 'P1') {
      summary.p1Count += 1;
    }

    if (effectiveFlag === 'P+') {
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

function buildBucketSummaryProjectionSql(bucket: KpiBucketKey, tbl = ''): string {
  const t = tbl ? `${tbl}.` : '';
  const bucketSql = buildKpiBucketFilterSql(bucket, tbl);
  const prefix = `${bucket}`;

  return [
    `CASE WHEN (${bucketSql}) THEN 1 ELSE 0 END AS \`${prefix}__hit\``,
    `CASE WHEN LOWER(COALESCE(${t}guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END AS \`${prefix}__is_ffg\``,
    `CASE WHEN ${t}ticket_id_gamas IS NOT NULL AND LOWER(TRIM(${t}ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END AS \`${prefix}__is_gamas\``,
    `CASE WHEN ${t}flagging_manja = 'P1' THEN 1 ELSE 0 END AS \`${prefix}__is_p1\``,
    `CASE WHEN ${t}flagging_manja = 'P+' THEN 1 ELSE 0 END AS \`${prefix}__is_p_plus\``,
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

const SORT_FIELD_MAP: Record<string, string> = {
  ticket: 'incident',
  customerType: 'customer_type',
  customerName: 'customer_name',
  serviceNo: 'service_no',
  workzone: 'workzone',
  bookingDate: 'booking_date',
  reportedDate: 'reported_date',
  age: 'reported_date',
  jenisTiket: 'jenis_tiket_2',
};

function buildMainTableOrderBySql(
  sort: 'asc' | 'desc',
  today: string,
  sortField?: string,
): [string, any[]] {
  const reportedDirection = sort === 'asc' ? 'ASC' : 'DESC';

  if (!sortField || sortField === 'priority') {
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

  const sqlColumn = SORT_FIELD_MAP[sortField];
  if (!sqlColumn) {
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

  const sortDir = sort === 'asc' ? 'ASC' : 'DESC';

  return [
    `
      ${sqlColumn} ${sortDir},
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
      reported_date DESC,
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
          { AND: [{ pending_dompis: { not: null } }, { pending_dompis: { not: '' } }, { status: { notIn: [...CLOSE_STATUS_VALUES] } }] },
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
      startDate,
      endDate,
      ctype,
      searchType,
      globalScope,
      gamasOnly,
    } = filters ?? {};

    const selectedWorkzone = await this.resolveSelectedWorkzone(workzone);
    const effectiveRole =
      globalScope && (role === 'admin' || role === 'superadmin' || role === 'super_admin')
        ? 'superadmin'
        : role;

    const where: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(effectiveRole, userId, selectedWorkzone)),
    };

    const isLegacyKpi = Array.isArray(operationalBucket)
      ? operationalBucket.includes('kpi_customer')
      : operationalBucket === 'kpi_customer';
    await this.applyDailyTicketFilter(where, undefined, isLegacyKpi);

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

    private static async fetchTicketIdsBySql(
      where: Prisma.ticketWhereInput,
      options: {
        sort: 'asc' | 'desc';
        sortField?: string;
        offset: number;
        limit: number;
        forceIndex?: 'idx_ticket_daily_board' | 'idx_ticket_daily_validasi';
        priorityToday?: string | null;
      },
  ): Promise<Array<{ id_ticket: number; rank_global: number }>> {
    const [whereClause, params] = buildSqlWhereClause(where);
    const [orderByClause, orderParams] = options.priorityToday
      ? buildMainTableOrderBySql(options.sort, options.priorityToday, options.sortField)
      : [
          `reported_date ${options.sort === 'asc' ? 'ASC' : 'DESC'}, id_ticket ASC`,
          [],
        ];
    const forceIndexClause = options.forceIndex
      ? `FORCE INDEX (${options.forceIndex})`
      : '';
    const sqlWithIndex = `
      SELECT id_ticket,
             ROW_NUMBER() OVER (ORDER BY reported_date ASC) AS rank_global
      FROM ticket ${forceIndexClause}
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ?, ?
    `;
    const sqlWithoutIndex = `
      SELECT id_ticket,
             ROW_NUMBER() OVER (ORDER BY reported_date ASC) AS rank_global
      FROM ticket
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ?, ?
    `;

    const rows = await queryRawWithOptionalIndex<Array<{ id_ticket: number; rank_global: bigint | number }>>(
      sqlWithIndex,
      sqlWithoutIndex,
      [...params, ...orderParams, options.offset, options.limit],
    );

    return rows.map((row) => ({
      id_ticket: row.id_ticket,
      rank_global: Number(row.rank_global),
    }));
  }

  private static async countTicketsBySql(
    where: Prisma.ticketWhereInput,
    forceIndex?: 'idx_ticket_daily_board' | 'idx_ticket_daily_validasi',
  ): Promise<number> {
    const [whereClause, params] = buildSqlWhereClause(where);
    const forceIndexClause = forceIndex
      ? `FORCE INDEX (${forceIndex})`
      : '';
    const sqlWithIndex = `
      SELECT COUNT(*) AS total
      FROM ticket ${forceIndexClause}
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
    if (process.env.VALIDASI_FLAG_ENABLED === 'true') {
      return {
        status: { notIn: [...CLOSE_STATUS_VALUES] },
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

  static buildMainTableWhere(
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
        id_ticket,
        status,
        status_update,
        guarantee_status,
        ticket_id_gamas,
        flagging_manja,
        booking_date
      FROM ticket
      WHERE ${mainSql}
    `;
    const mainWithoutIndex = `
      SELECT
        id_ticket,
        status,
        status_update,
        guarantee_status,
        ticket_id_gamas,
        flagging_manja,
        booking_date
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

  private static async countValidasiFlaggingSummary(
    validasiBaseWhere: Prisma.ticketWhereInput,
  ): Promise<Array<Record<string, unknown>>> {
    const [sql, params] = buildSqlWhereClause(validasiBaseWhere);
    const sqlWithIndex = `
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
    const [whereClause, params] = buildSqlWhereClause(where);

    const rows = await queryRawWithOptionalIndex<
      Array<{ status: string | null; status_update: string | null; count: bigint | number }>
    >(
      `
      SELECT status, status_update, COUNT(*) AS count
      FROM ticket FORCE INDEX (idx_ticket_daily_board)
      WHERE ${whereClause}
      GROUP BY status, status_update
    `,
      `
      SELECT status, status_update, COUNT(*) AS count
      FROM ticket
      WHERE ${whereClause}
      GROUP BY status, status_update
    `,
      params,
    );

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
    const { page = 1, limit = 10, sort = 'desc', sortField } = filters ?? {};
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
      ? await this.buildDailyTicketWhere(role, userId, {
          ...filters,
          excludeSymptom: undefined,
        })
      : null;
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

    const mainTableWhere = this.buildMainTableWhere(where, {
      includeClosed,
    });
    const validasiBaseWhere = includeValidasi
      ? this.buildValidasiBaseWhere(validasiWhere ?? where)
      : null;
    const ticketIdsPromise = this.fetchTicketIdsBySql(mainTableWhere, {
      sort,
      sortField: sortField && sortField !== 'priority' ? sortField : undefined,
      offset,
      limit: safeLimit,
      priorityToday: toWibDateString(todayWibDateForDb()),
    });
    const validasiTicketIdsPromise = includeValidasi && includeValidasiTickets && validasiBaseWhere
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

    const rankMap = new Map<number, number>();
    const ticketIdList = ticketIds.map((r) => {
      rankMap.set(r.id_ticket, r.rank_global);
      return r.id_ticket;
    });

    const [tickets, validasiTickets] = await Promise.all([
      hydrateTicketsByIds(ticketIdList),
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
      data: mappedTickets,
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
    const mainTableWhere = this.buildMainTableWhere(where, {
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

  static async buildDailyTicketSqlParams(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<[string, any[]]> {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where, {
      includeClosed: filters?.includeClosed === true,
    });
    return buildSqlWhereClause(mainTableWhere);
  }

  private static buildDailySummarySql(): string {
    const closeStatusList = CLOSE_STATUS_VALUES.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
    return `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) IN (${closeStatusList}) THEN 1 ELSE 0 END) AS close,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) NOT IN (${closeStatusList}) AND LOWER(TRIM(COALESCE(status_update, ''))) IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) NOT IN (${closeStatusList}) AND LOWER(TRIM(COALESCE(status_update, ''))) = 'on_progress' THEN 1 ELSE 0 END) AS onProgress,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) NOT IN (${closeStatusList}) AND LOWER(TRIM(COALESCE(status_update, ''))) = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN UPPER(TRIM(COALESCE(status, ''))) NOT IN (${closeStatusList}) AND (LOWER(TRIM(COALESCE(status_update, ''))) NOT IN ('assigned', 'on_progress', 'pending', 'escalated', 'close') OR status_update IS NULL) THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN LOWER(COALESCE(guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
        SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND LOWER(TRIM(ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
        SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
        SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
      FROM ticket
      WHERE %s
    `;
  }

  static async getDailyTicketSummary(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where, {
      includeClosed: filters?.includeClosed === true,
    });
    const validasiBaseWhere = this.buildValidasiBaseWhere(where);

    const [mainWhereClause, mainParams] = buildSqlWhereClause(mainTableWhere);
    const combinedSql = this.buildDailySummarySql().replace('%s', mainWhereClause);

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

  static async hasDailyTicketHit(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const ticket = await prisma.ticket.findFirst({
      where,
      select: { id_ticket: true },
    });

    return Boolean(ticket);
  }

  static async hasDailyValidasiHit(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const validasiWhere = this.buildValidasiBaseWhere(where);
    if (!validasiWhere) return false;

    const ticket = await prisma.ticket.findFirst({
      where: validasiWhere,
      select: { id_ticket: true },
    });

    return Boolean(ticket);
  }

  static async getKpiBucketSummaryMatrix(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<BucketSummaryMatrix> {
    const cacheKey = buildKpiBucketSummaryCacheKey(role, userId, filters);
    return getOrSetCache(
      cacheKey,
      async () => {
        const buildScopeSummary = async (
          dept: BucketSummaryScope,
        ): Promise<BucketSummaryMap> => {
          const summary = {} as BucketSummaryMap;

          const baseWhere = await this.buildDailyTicketWhere(role, userId, {
            ...filters,
            dept,
            operationalBucket: undefined,
          });
          const mainTableWhere = this.buildMainTableWhere(baseWhere, {
            includeClosed: filters?.includeClosed === true,
          });

          type BucketKeyNoAll = Exclude<KpiBucketKey, 'all'>;
          const NON_KPI_BUCKETS: BucketKeyNoAll[] = ['kpi_proactive', 'non_kpi_unspec', 'non_technical', 'sqm_update', 'obsolete'];

          const [mainSql, mainParams] = buildSqlWhereClause(mainTableWhere);
          const allSelects = NON_KPI_BUCKETS.map(b => buildBucketSummarySelect(b)).join(',\n');
          const combinedSql = `
            SELECT
              ${allSelects}
            FROM ticket
            WHERE ${mainSql}
          `;
          const [combinedRows] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
            combinedSql, combinedSql, mainParams,
          );
          const combinedRow = combinedRows ?? {};
          for (const bucket of NON_KPI_BUCKETS) {
            summary[bucket] = normalizeBucketSummaryRow(combinedRow, bucket);
          }

          const kpiWhere = await this.buildDailyTicketWhere(role, userId, {
            ...filters,
            dept,
            operationalBucket: ['kpi_customer'],
          });
          const kpiMainTableWhere = this.buildMainTableWhere(kpiWhere, {
            includeClosed: filters?.includeClosed === true,
          });
          const kpiFinalWhere: Prisma.ticketWhereInput = {
            AND: [kpiMainTableWhere, buildOperationalBucketWhere('kpi_customer')],
          };
          const [kpiSql, kpiParams] = buildSqlWhereClause(kpiFinalWhere);
          const kpiSelect = buildBucketSummarySelect('kpi_customer');
          const kpiQuery = `
            SELECT
              ${kpiSelect}
            FROM ticket
            WHERE ${kpiSql}
          `;
          const [kpiRow] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
            kpiQuery, kpiQuery, kpiParams,
          );
          summary.kpi_customer = normalizeBucketSummaryRow(kpiRow ?? {}, 'kpi_customer');

          return summary;
        };

        const [all, b2c, b2b] = await Promise.all([
          buildScopeSummary('all'),
          buildScopeSummary('b2c'),
          buildScopeSummary('b2b'),
        ]);

        return { all, b2c, b2b };
      },
      DASHBOARD_CACHE_TTL,
    );
  }

  static async getTicketManagementOverviewSummary(
    role: string,
    userId: number,
    workzone?: string,
  ): Promise<TicketManagementOverviewSummary> {
    const cacheKey = `dashboard:ticket_management_overview_summary:${role}:${userId}:${workzone || 'all'}`;

    return getOrSetCache(
      cacheKey,
      async () => {
        const bucketDefs = [
          { key: 'kpiCustomer', bucket: 'kpi_customer' as const },
          { key: 'kpiProactive', bucket: 'kpi_proactive' as const },
          { key: 'nonKpiUnspec', bucket: 'non_kpi_unspec' as const },
          { key: 'nonTechnical', bucket: 'non_technical' as const },
          { key: 'sqmUpdate', bucket: 'sqm_update' as const },
          { key: 'obsolete', bucket: 'obsolete' as const },
        ];

        const NON_KPI_BUCKETS = ['kpi_proactive', 'non_kpi_unspec', 'non_technical', 'sqm_update', 'obsolete'] as const;
        type BucketKeyNoKpi = typeof NON_KPI_BUCKETS[number];

        const buildScopeSummary = async (
          dept: string,
          includeClosed: boolean,
        ): Promise<Record<string, BucketSummary>> => {
          const summary = {} as Record<string, BucketSummary>;

          const baseWhere = await this.buildDailyTicketWhere(role, userId, {
            workzone,
            dept,
            operationalBucket: undefined,
          });
          const mainTableWhere = this.buildMainTableWhere(baseWhere, { includeClosed });
          const [mainSql, mainParams] = buildSqlWhereClause(mainTableWhere);
          const statusCategorySql = buildStatusCategorySql();
          const projectedColumns = [
            `${statusCategorySql} AS status_category`,
            ...NON_KPI_BUCKETS.flatMap((bucket) =>
              buildBucketSummaryProjectionSql(bucket).split(',\n'),
            ),
            ...buildBucketSummaryProjectionSql('kpi_customer').split(',\n'),
          ];
          const projectedRowsSql = `
            SELECT
              ${projectedColumns.join(',\n              ')}
            FROM ticket
            WHERE ${mainSql}
          `;
          const combinedSql = `
            SELECT
              ${NON_KPI_BUCKETS.map((bucket) => [
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__total\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'open' THEN 1 ELSE 0 END) AS \`${bucket}__open\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'assigned' THEN 1 ELSE 0 END) AS \`${bucket}__assigned\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'on_progress' THEN 1 ELSE 0 END) AS \`${bucket}__on_progress\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'pending' THEN 1 ELSE 0 END) AS \`${bucket}__pending\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'close' THEN 1 ELSE 0 END) AS \`${bucket}__close\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_ffg\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__ffg\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_gamas\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__gamas\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_p1\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__p1\``,
                `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_p_plus\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__p_plus\``,
              ].join(',\n              ')).join(',\n              ')},
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__total\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'open' THEN 1 ELSE 0 END) AS \`kpi_customer__open\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'assigned' THEN 1 ELSE 0 END) AS \`kpi_customer__assigned\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'on_progress' THEN 1 ELSE 0 END) AS \`kpi_customer__on_progress\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'pending' THEN 1 ELSE 0 END) AS \`kpi_customer__pending\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'close' THEN 1 ELSE 0 END) AS \`kpi_customer__close\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_ffg\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__ffg\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_gamas\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__gamas\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_p1\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__p1\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_p_plus\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__p_plus\`
            FROM (
              ${projectedRowsSql}
            ) scoped
          `;
          const [combinedRows] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
            combinedSql, combinedSql, mainParams,
          );
          const combinedRow = combinedRows ?? {};
          for (const bucket of NON_KPI_BUCKETS) {
            summary[bucket] = normalizeBucketSummaryRow(combinedRow, bucket);
          }

          const kpiWhere = await this.buildDailyTicketWhere(role, userId, {
            workzone,
            dept,
            operationalBucket: ['kpi_customer'],
          });
          const kpiMainTableWhere = this.buildMainTableWhere(kpiWhere, { includeClosed });
          const kpiFinalWhere: Prisma.ticketWhereInput = {
            AND: [kpiMainTableWhere, buildOperationalBucketWhere('kpi_customer')],
          };
          const [kpiSql, kpiParams] = buildSqlWhereClause(kpiFinalWhere);
          const kpiQuery = `
            SELECT
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__total\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'open' THEN 1 ELSE 0 END) AS \`kpi_customer__open\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'assigned' THEN 1 ELSE 0 END) AS \`kpi_customer__assigned\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'on_progress' THEN 1 ELSE 0 END) AS \`kpi_customer__on_progress\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'pending' THEN 1 ELSE 0 END) AS \`kpi_customer__pending\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND status_category = 'close' THEN 1 ELSE 0 END) AS \`kpi_customer__close\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_ffg\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__ffg\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_gamas\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__gamas\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_p1\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__p1\`,
              SUM(CASE WHEN \`kpi_customer__hit\` = 1 AND \`kpi_customer__is_p_plus\` = 1 THEN 1 ELSE 0 END) AS \`kpi_customer__p_plus\`
            FROM (
              SELECT
                ${statusCategorySql} AS status_category,
                ${buildBucketSummaryProjectionSql('kpi_customer')}
              FROM ticket
              WHERE ${kpiSql}
            ) scoped
          `;
          const [kpiRow] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
            kpiQuery, kpiQuery, kpiParams,
          );
          summary.kpi_customer = normalizeBucketSummaryRow(kpiRow ?? {}, 'kpi_customer');

          return summary;
        };

        const buildCloseOnlySummary = async (
          dept: string,
        ): Promise<Record<string, BucketSummary>> => {
          const summary = {} as Record<string, BucketSummary>;

          const baseWhere = await this.buildDailyTicketWhere(role, userId, {
            workzone,
            dept,
            operationalBucket: undefined,
          });
          const mainTableWhere = this.buildMainTableWhere(baseWhere, { includeClosed: true });
          const [mainSql, mainParams] = buildSqlWhereClause(mainTableWhere);
          const statusCategorySql = buildStatusCategorySql();
          const closeSelects = bucketDefs
            .map(({ bucket }) => `SUM(CASE WHEN (${buildKpiBucketFilterSql(bucket)}) AND ${statusCategorySql} = 'close' THEN 1 ELSE 0 END) AS \`${bucket}__close\``)
            .join(',\n              ');
          const closeQuery = `
            SELECT
              ${closeSelects}
            FROM ticket
            WHERE ${mainSql}
          `;
          const [closeRows] = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
            closeQuery, closeQuery, mainParams,
          );
          const closeRow = closeRows ?? {};
          for (const { bucket } of bucketDefs) {
            summary[bucket] = {
              total: 0,
              open: 0,
              assigned: 0,
              onProgress: 0,
              pending: 0,
              close: parseCountValue(closeRow?.[`${bucket}__close`]),
              ffgCount: 0,
              gamasCount: 0,
              p1Count: 0,
              pPlusCount: 0,
            };
          }

          return summary;
        };

        const [all, b2c, b2b, closeMap] = await Promise.all([
          buildScopeSummary('all', false),
          buildScopeSummary('b2c', false),
          buildScopeSummary('b2b', false),
          buildCloseOnlySummary('all'),
        ]);

        const toCardSummary = (s: BucketSummary): TicketManagementBucketSummary & { ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number } => ({
          total: s.total,
          open: s.open,
          assigned: s.assigned + s.onProgress + s.pending,
          close: s.close,
          ffgCount: s.ffgCount,
          gamasCount: s.gamasCount,
          p1Count: s.p1Count,
          pPlusCount: s.pPlusCount,
        });

        const allCard = Object.fromEntries(
          bucketDefs.map(({ bucket }) => [bucket, toCardSummary(all[bucket])]),
        ) as Record<string, TicketManagementBucketSummary & { ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number }>;
        const b2cCard = Object.fromEntries(
          bucketDefs.map(({ bucket }) => [bucket, toCardSummary(b2c[bucket])]),
        ) as Record<string, TicketManagementBucketSummary>;
        const b2bCard = Object.fromEntries(
          bucketDefs.map(({ bucket }) => [bucket, toCardSummary(b2b[bucket])]),
        ) as Record<string, TicketManagementBucketSummary>;
        const closeCard = Object.fromEntries(
          bucketDefs.map(({ bucket }) => [bucket, toCardSummary(closeMap[bucket])]),
        ) as Record<string, TicketManagementBucketSummary>;

        const totalAll = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].total, 0,
        );
        const deptB2CTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + b2cCard[bucket].total, 0,
        );
        const deptB2BTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + b2bCard[bucket].total, 0,
        );
        const unassignedTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].open, 0,
        );
        const assignedTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].assigned, 0,
        );
        const closeTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + closeCard[bucket].close, 0,
        );
        const ffgTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].ffgCount, 0,
        );
        const gamasTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].gamasCount, 0,
        );
        const p1Total = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].p1Count, 0,
        );
        const pPlusTotal = bucketDefs.reduce(
          (sum, { bucket }) => sum + allCard[bucket].pPlusCount, 0,
        );

        return {
          totals: {
            total: totalAll,
            b2c: deptB2CTotal,
            b2b: deptB2BTotal,
            unassigned: unassignedTotal,
            assigned: assignedTotal,
            close: closeTotal,
            ffgCount: ffgTotal,
            gamasCount: gamasTotal,
            p1Count: p1Total,
            pPlusCount: pPlusTotal,
          },
          cards: {
            kpiCustomer: { ...allCard.kpi_customer, close: closeCard.kpi_customer.close },
            kpiProactive: { ...allCard.kpi_proactive, close: closeCard.kpi_proactive.close },
            nonKpiUnspec: { ...allCard.non_kpi_unspec, close: closeCard.non_kpi_unspec.close },
            nonTechnical: { ...allCard.non_technical, close: closeCard.non_technical.close },
            sqmUpdate: { ...allCard.sqm_update, close: closeCard.sqm_update.close },
            obsolete: { ...allCard.obsolete, close: closeCard.obsolete.close },
          },
        };
      },
      DASHBOARD_CACHE_TTL,
    );
  }

  /**
   * Daily Stats
   */

  static async buildDetailWoHiWhere(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<Record<string, any>> {
    const [kpiCustomerWhere, nonKpiWhere] = await Promise.all([
      this.buildDailyTicketWhere(role, userId, {
        ...filters,
        operationalBucket: ['kpi_customer'],
      }),
      this.buildDailyTicketWhere(role, userId, {
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
      sql,
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

  static async getHourlyCloseCounts(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<Array<{ hour: number; count: number }>> {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where, {
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
        AND UPPER(TRIM(status)) IN (${closeStatusSql})
      GROUP BY HOUR(closed_at)
    `;

    const rows = await prisma.$queryRawUnsafe<Array<{ hour: number; count: bigint | number }>>(
      sql,
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

  static async getTopSymptoms(
    role: string,
    userId: number,
    limit = 10,
    filters?: TicketFilters,
  ): Promise<Array<{ symptom: string; count: number }>> {
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where, {
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
    const rows = await prisma.$queryRawUnsafe<Array<{ symptom_clean: string; count: bigint }>>(sql, ...params, limit);
    return rows.map((r) => ({ symptom: r.symptom_clean, count: Number(r.count) }));
  }

  static async getB2CBreakdown(
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
    const where = await this.buildDailyTicketWhere(role, userId, filters);
    const mainTableWhere = this.buildMainTableWhere(where);
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
    }>>(sql, ...params);

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
}
