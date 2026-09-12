// Tipe & fungsi murni (tanpa I/O, tanpa `this`) untuk domain Daily Ticket —
// dipisah dari daily-ticket.service.ts (yang tadinya 3521 baris, dipakai oleh
// ~20 file di seluruh repo) semata untuk memecah unit kompilasi jadi lebih
// kecil. Tidak ada perubahan logic, murni pemindahan kode.

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import {
  DASHBOARD_CACHE_TTL,
  DASHBOARD_SUMMARY_CACHE_TTL,
  getOrSetCache,
  getOrSetCacheSwr,
} from '@/lib/cache';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';
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
import { toWibString, toWibDateString, getTodayWibRange } from '@/lib/timezone';
import { resolveEffectiveFlagging } from '../flagging-manja';
import { normalizeSearchInput, type SearchType } from '@/lib/search-intent';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

export type BucketSummary = {
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

export type BucketSummaryMap = Record<
  'kpi_customer' | 'kpi_proactive' | 'non_kpi_unspec' | 'non_technical' | 'sqm_update' | 'obsolete',
  BucketSummary
>;

export type BucketSummaryScope = 'all' | 'b2c' | 'b2b';

export type BucketSummaryMatrix = Record<BucketSummaryScope, BucketSummaryMap>;

export const KPI_SUMMARY_BUCKETS = [
  'kpi_customer',
  'kpi_proactive',
  'non_kpi_unspec',
  'non_technical',
  'sqm_update',
  'obsolete',
] as const;

export type TicketFilters = {
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
  branchId?: number | string;
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
  cursor?: string;
  countOnly?: boolean;
};

export type TicketTypeOption = {
  key: string;
  label: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
};

export type FlaggingSummary = {
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
};

export type CustomerTypeSummary = {
  hvcDiamond: number;
  hvcPlatinum: number;
  hvcGold: number;
  reguler: number;
};

export type TicketManagementBucketSummary = {
  total: number;
  open: number;
  assigned: number;
  close: number;
};

export type TicketManagementOverviewSummary = {
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

export function normalizeCacheFilterValue(value: unknown): unknown {
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

export function buildKpiBucketSummaryCacheKey(
  role: string,
  userId: number,
  filters?: TicketFilters,
): string {
  const normalized = normalizeCacheFilterValue(filters ?? {});
  const scopedUserId = role === 'superadmin' || role === 'super_admin' ? 0 : userId;
  return `dashboard:kpi_bucket_summary:v2:${role}:${scopedUserId}:${JSON.stringify(normalized)}`;
}

export function normalizeStatusUpdateFilter(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function normalizeStringList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== 'all');
}

export function normalizeTicketStatusFilter(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function buildTicketSearchWhere(
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
export function applyStatusUpdateWhere(
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

export function applyTicketStatusWhere(
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

export function applyTicketTypeWhere(
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

export function applyTicketGroupWhere(
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

export function applyFlaggingWhere(
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

export function applyOperationalBucketFilterWhere(
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

export function applyRegulerOnlyWhere(
  where: Record<string, any>,
  regulerOnly?: boolean,
) {
  if (!regulerOnly) return;
  where.AND = [...(where.AND ?? []), buildRegulerJenis1Where()];
}

export function applyAnomalyBucketFilterWhere(
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

export function buildDeptSegmentWhere(dept?: string): Record<string, unknown> | null {
  if (!dept || dept === 'all') return null;
  // dept 3-segmen berbasis jenis_tiket_2 (netral priority), permintaan dinamis via customer_segment
  // helper di lib/dept.ts sudah handle netral/b2c/b2b
  // dynamic import hindari circular: inline via require
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildDeptJenisWhere } = require('@/lib/dept') as typeof import('@/lib/dept');
  if (dept === 'b2c' || dept === 'b2b' || dept === 'netral' || dept === 'neutral') {
    const key = dept === 'neutral' ? 'netral' : dept;
    return buildDeptJenisWhere(key as 'b2c' | 'b2b' | 'netral');
  }
  // legacy fallback (seharusnya tidak terpakai)
  if (dept === 'b2c') return { customer_segment: { in: ['DCS', 'PL-TSEL'] } };
  return null;
}

/**
 * Ticket mapper
 */

export function mapTicket(t: any) {
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
    ttrComplyStatus: t.ttr_comply_status,
    technicianName: t.users?.nama,
    worklogSummary: t.worklog_summary,
    validationReason: t.validation_reason,
    syncedAt: toWibString(t.synced_at),
    importBatch: t.import_batch,
    importedAt: toWibString(t.imported_at),
  };
}

export function isMissingIndexError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? '');
  return message.includes('Code: `1176`') || /doesn't exist in table/i.test(message);
}

const FULLTEXT_FIELDS = new Set(['jenis_tiket_1', 'jenis_tiket_2', 'symptom']);
const FULLTEXT_MIN_TOKEN_LENGTH = 3;

function buildFtsBooleanQuery(term: string): { match: string | null; like: string } {
  const tokens = term
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= FULLTEXT_MIN_TOKEN_LENGTH);
  if (tokens.length === 0) {
    return { match: null, like: `%${term}%` };
  }
  return { match: tokens.map((t) => `+${t}*`).join(' '), like: `%${term}%` };
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
            if (FULLTEXT_FIELDS.has(key)) {
              const fts = buildFtsBooleanQuery(String(operator.not.contains));
              if (fts.match) {
                conditions.push(`NOT MATCH(\`${key}\`) AGAINST(? IN BOOLEAN MODE)`);
                params.push(fts.match);
              } else {
                conditions.push(`\`${key}\` NOT LIKE ?`);
                params.push(fts.like);
              }
            } else {
              conditions.push(`\`${key}\` NOT LIKE ?`);
              params.push(`%${operator.not.contains}%`);
            }
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
          if (FULLTEXT_FIELDS.has(key)) {
            const fts = buildFtsBooleanQuery(String(operator.contains));
            if (fts.match) {
              conditions.push(`MATCH(\`${key}\`) AGAINST(? IN BOOLEAN MODE)`);
              params.push(fts.match);
            } else {
              conditions.push(`\`${key}\` LIKE ?`);
              params.push(fts.like);
            }
          } else {
            conditions.push(`\`${key}\` LIKE ?`);
            params.push(`%${operator.contains}%`);
          }
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

/**
 * Detects the daily-ticket OR pattern (status NOT IN closed OR status IN closed AND closed_at >= today)
 * and splits it into separate WHERE clauses for UNION ALL optimization.
 *
 * Each UNION branch can do an independent range scan on idx_ticket_dashboard_main,
 * avoiding MySQL index-merge which requires duplicate elimination and scans 37K+ rows.
 */
export function splitDailyFilterUnion(
  where: Prisma.ticketWhereInput,
): { branchSqls: string[]; params: any[][] } | null {
  if (!where.AND || !Array.isArray(where.AND)) return null;

  const andArray = where.AND as any[];
  const dailyIdx = andArray.findIndex((clause: any) => {
    if (!clause?.OR || !Array.isArray(clause.OR)) return false;
    if (clause.OR.length < 2 || clause.OR.length > 3) return false;
    const second = clause.OR[1];
    if (!second?.AND) return false;
    const andArr = Array.isArray(second.AND) ? second.AND : [second.AND];
    return andArr.some((c: any) => c?.closed_at?.gte !== undefined);
  });

  if (dailyIdx === -1) return null;

  const dailyFilter = andArray[dailyIdx] as { OR: any[] };
  const branches = dailyFilter.OR;
  if (branches.length !== 2) return null;

  const baseConditions = andArray.filter((_: any, i: number) => i !== dailyIdx);

  const topLevelKeys = Object.keys(where).filter((k) => k !== 'AND');

  const branchSqls: string[] = [];
  const branchParams: any[][] = [];

  for (const branch of branches) {
    const branchWhere: Record<string, any> = {};
    for (const key of topLevelKeys) {
      branchWhere[key] = (where as any)[key];
    }
    branchWhere.AND = [...baseConditions, branch];
    const [sql, params] = buildSqlWhereClause(branchWhere as Prisma.ticketWhereInput);
    branchSqls.push(sql);
    branchParams.push(params);
  }

  return { branchSqls, params: branchParams };
}

export function parseCountValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeBucketRows(
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

export function buildStatusCategorySql(tbl = ''): string {
  const t = tbl ? `${tbl}.` : '';
  const closeStatusesSql = CLOSE_STATUS_VALUES.map((status) =>
    `'${status.replace(/'/g, "''")}'`,
  ).join(', ');

  return `
    CASE
      WHEN ${t}status IN (${closeStatusesSql}) THEN 'close'
      WHEN ${t}status_update = 'assigned' THEN 'assigned'
      WHEN ${t}status_update = 'on_progress' THEN 'on_progress'
      WHEN ${t}status_update = 'pending' THEN 'pending'
      ELSE 'open'
    END
  `;
}

export function buildBucketSummarySelect(bucket: KpiBucketKey, tbl = ''): string {
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

export function buildBucketSummaryProjectionSql(bucket: KpiBucketKey, tbl = ''): string {
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

export function normalizeBucketSummaryRow(row: Record<string, unknown> | undefined, bucket: KpiBucketKey): BucketSummary {
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

export async function hydrateTicketsByIds(ids: number[]) {
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

export async function queryRawWithOptionalIndex<T>(
  sqlWithIndex: string,
  _sqlWithoutIndex: string,
  params: unknown[],
): Promise<T> {
  return prisma.$queryRawUnsafe<T>(sqlWithIndex, ...params);
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

export function buildMainTableOrderBySql(
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
