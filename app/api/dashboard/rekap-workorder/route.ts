import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCache } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWibDateString, getTodayWibRange } from '@/lib/timezone';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { getTicketCategory } from '@/app/libs/ticket-utils';
import {
  buildKpiBucketFilterSql,
  type KpiBucketKey,
} from '@/app/libs/services/kpi-bucket-sql';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { logger } from '@/lib/observability/logger';

interface RekapTicketRow {
  area: string;
  sa_name: string;
  workzone: string | null;
  customer_type: string | null;
  customer_segment: string | null;
  jenis_tiket: string | null;
  status: string;
  status_update: string;
  closed_at: Date | null;
  cnt: bigint;
  source_ticket: string | null;
  classification_flag: string | null;
  classification_path: string | null;
  summary: string | null;
  symptom: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
}

interface CustomerSqmOverlayRow extends RekapTicketRow {
  overlay_kind: 'proactive' | 'sqm_update';
}

interface LegacyCustomerBucketRow {
  area: string;
  sa_name: string;
  workzone: string;
  status: string;
  status_update: string;
  cnt: bigint;
}

interface SegCount {
  open: number;
  close: number;
}

type BucketKey =
  | 'kpiCustomer'
  | 'kpiProactive'
  | 'nonKpiUnspec'
  | 'nonTechnical'
  | 'sqmUpdate'
  | 'obsolete';

interface BucketRecord {
  kpiCustomer: SegCount;
  kpiProactive: SegCount;
  nonKpiUnspec: SegCount;
  nonTechnical: SegCount;
  sqmUpdate: SegCount;
  obsolete: SegCount;
}

interface DetailGroup {
  b2c: Record<string, SegCount>;
  b2b: Record<string, SegCount>;
}

interface WorkzoneRow {
  workzone: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  totalOpen: number;
  totalClose: number;
  totalAll: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface KpiSummaryCounts {
  total: number;
  kpiCustomer: number;
  kpiProactive: number;
  nonKpiUnspec: number;
  nonTechnical: number;
  sqmUpdate: number;
  obsolete: number;
}

interface BucketSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
}

interface BucketBreakdownCounts {
  kpiCustomer: BucketSummaryCounts;
  kpiProactive: BucketSummaryCounts;
  nonKpiUnspec: BucketSummaryCounts;
  nonTechnical: BucketSummaryCounts;
  sqmUpdate: BucketSummaryCounts;
  obsolete: BucketSummaryCounts;
}

interface WorkboardSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
}

function buildBucketSummaryFromRows(
  rows: RekapTicketRow[],
): BucketSummaryCounts {
  return rows.reduce<BucketSummaryCounts>(
    (acc, row) => {
      const category = getTicketCategory(row.status, row.status_update);
      const cnt = Number(row.cnt ?? 0);
      acc.total += cnt;
      if (category === 'close') {
        acc.close += cnt;
      } else {
        acc.open += cnt;
        if (category === 'assigned') {
          acc.assigned += cnt;
        }
      }
      return acc;
    },
    { total: 0, open: 0, assigned: 0, close: 0 },
  );
}

function buildTicketManagementStyleBucketSummaryFromRows(
  rows: RekapTicketRow[],
): BucketSummaryCounts {
  return rows.reduce<BucketSummaryCounts>(
    (acc, row) => {
      const status = String(row.status ?? '')
        .trim()
        .toUpperCase();
      const statusUpdate = String(row.status_update ?? '')
        .trim()
        .toLowerCase();
      const cnt = Number(row.cnt ?? 0);

      acc.total += cnt;

      if (CLOSE_STATUS_VALUES.includes(status)) {
        acc.close += cnt;
        return acc;
      }

      if (
        statusUpdate === 'assigned' ||
        statusUpdate === 'on_progress' ||
        statusUpdate === 'pending' ||
        statusUpdate === 'escalated'
      ) {
        acc.assigned += cnt;
      }

      acc.open += cnt;
      return acc;
    },
    { total: 0, open: 0, assigned: 0, close: 0 },
  );
}

function normalizeMergeKeyPart(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function buildMergeKey(
  area: string | null | undefined,
  saName: string | null | undefined,
  workzone: string | null | undefined,
): string {
  return [
    normalizeMergeKeyPart(area),
    normalizeMergeKeyPart(saName),
    normalizeMergeKeyPart(workzone || 'UNKNOWN'),
  ].join('||');
}

function buildCustomerLegacySummaryFromRows(
  rows: LegacyCustomerBucketRow[],
): Map<string, { open: number; close: number }> {
  const map = new Map<string, { open: number; close: number }>();

  for (const row of rows) {
    const key = buildMergeKey(row.area, row.sa_name, row.workzone);
    const cnt = Number(row.cnt ?? 0);
    if (!map.has(key)) {
      map.set(key, { open: 0, close: 0 });
    }
    const entry = map.get(key)!;
    const status = String(row.status ?? '')
      .trim()
      .toUpperCase();
    const statusUpdate = String(row.status_update ?? '')
      .trim()
      .toLowerCase();
    if (CLOSE_STATUS_VALUES.includes(status)) {
      entry.close += cnt;
    } else {
      entry.open += cnt;
      if (
        statusUpdate === 'assigned' ||
        statusUpdate === 'on_progress' ||
        statusUpdate === 'pending' ||
        statusUpdate === 'escalated'
      ) {
        // Keep the old split for close/audit views while treating the row as open workload.
      }
    }
  }

  return map;
}

function buildCustomerSqmSummaryFromRows(
  rows: RekapTicketRow[],
  kind: 'proactive' | 'sqm_update',
): Map<string, { open: number; close: number; update: number }> {
  const map = new Map<
    string,
    { open: number; close: number; update: number }
  >();

  for (const row of rows) {
    const key = buildMergeKey(row.area, row.sa_name, row.workzone);
    const cnt = Number(row.cnt ?? 0);
    const category = getTicketCategory(row.status, row.status_update);
    if (!map.has(key)) {
      map.set(key, { open: 0, close: 0, update: 0 });
    }
    const entry = map.get(key)!;
    if (kind === 'proactive') {
      if (category === 'close') entry.close += cnt;
      else if (category === 'open') entry.open += cnt;
    } else {
      if (category === 'close') entry.close += cnt;
      else entry.update += cnt;
    }
  }

  return map;
}

function buildBucketSummaryFromDailySummaries(
  dailySummaryMap: Partial<Record<KpiBucketKey, BucketSummaryCounts>>,
  bucket: KpiBucketKey,
): BucketSummaryCounts {
  if (bucket !== 'all') return dailySummaryMap[bucket]!;

  const keys: KpiBucketKey[] = [
    'kpi_customer',
    'kpi_proactive',
    'non_kpi_unspec',
    'non_technical',
    'sqm_update',
    'obsolete',
  ];

  return keys.reduce<BucketSummaryCounts>(
    (acc, key) => {
      const item = dailySummaryMap[key]!;
      acc.total += item.total;
      acc.open += item.open;
      acc.assigned += item.assigned;
      acc.close += item.close;
      return acc;
    },
    { total: 0, open: 0, assigned: 0, close: 0 },
  );
}

function buildBucketBreakdownFromDailySummaries(
  dailySummaryMap: Partial<Record<KpiBucketKey, BucketSummaryCounts>>,
): BucketBreakdownCounts {
  const pick = (bucket: KpiBucketKey): BucketSummaryCounts =>
    dailySummaryMap[bucket] ?? { total: 0, open: 0, assigned: 0, close: 0 };

  return {
    kpiCustomer: pick('kpi_customer'),
    kpiProactive: pick('kpi_proactive'),
    nonKpiUnspec: pick('non_kpi_unspec'),
    nonTechnical: pick('non_technical'),
    sqmUpdate: pick('sqm_update'),
    obsolete: pick('obsolete'),
  };
}

function buildBucketBreakdownFromOverviewCards(
  cards: Awaited<
    ReturnType<typeof DailyTicketService.getTicketManagementOverviewSummary>
  >['cards'],
): BucketBreakdownCounts {
  return {
    kpiCustomer: {
      total: cards.kpiCustomer.total,
      open: cards.kpiCustomer.open,
      assigned: cards.kpiCustomer.assigned,
      close: cards.kpiCustomer.close,
    },
    kpiProactive: {
      total: cards.kpiProactive.total,
      open: cards.kpiProactive.open,
      assigned: cards.kpiProactive.assigned,
      close: cards.kpiProactive.close,
    },
    nonKpiUnspec: {
      total: cards.nonKpiUnspec.total,
      open: cards.nonKpiUnspec.open,
      assigned: cards.nonKpiUnspec.assigned,
      close: cards.nonKpiUnspec.close,
    },
    nonTechnical: {
      total: cards.nonTechnical.total,
      open: cards.nonTechnical.open,
      assigned: cards.nonTechnical.assigned,
      close: cards.nonTechnical.close,
    },
    sqmUpdate: {
      total: cards.sqmUpdate.total,
      open: cards.sqmUpdate.open,
      assigned: cards.sqmUpdate.assigned,
      close: cards.sqmUpdate.close,
    },
    obsolete: {
      total: cards.obsolete.total,
      open: cards.obsolete.open,
      assigned: cards.obsolete.assigned,
      close: cards.obsolete.close,
    },
  };
}

function buildTicketManagementBucketSummary(
  openSummary: Awaited<
    ReturnType<typeof DailyTicketService.getDailyTicketTable>
  >['summary'],
  closeSummary: Awaited<
    ReturnType<typeof DailyTicketService.getDailyTicketTable>
  >['summary'],
): BucketSummaryCounts {
  const total =
    Number(openSummary.total ?? 0) + Number(closeSummary.total ?? 0);
  const close = Number(closeSummary.close ?? 0);
  return {
    total,
    open: Math.max(total - close, 0),
    assigned: Number(openSummary.assigned ?? 0),
    close,
  };
}

function sumTicketRows(rows: RekapTicketRow[]): number {
  return rows.reduce((total, row) => total + Number(row.cnt ?? 0), 0);
}

function buildSelectedBucketSummary(
  bucket: KpiBucketKey,
  rows: RekapTicketRow[],
  globalSummary: KpiSummaryCounts,
): KpiSummaryCounts {
  if (bucket === 'all') return globalSummary;

  const total = rows.reduce((sum, row) => sum + Number(row.cnt ?? 0), 0);
  return {
    total,
    kpiCustomer: bucket === 'kpi_customer' ? total : 0,
    kpiProactive: bucket === 'kpi_proactive' ? total : 0,
    nonKpiUnspec: bucket === 'non_kpi_unspec' ? total : 0,
    nonTechnical: bucket === 'non_technical' ? total : 0,
    sqmUpdate: bucket === 'sqm_update' ? total : 0,
    obsolete: bucket === 'obsolete' ? total : 0,
  };
}

function buildWorkboardSummary(
  overview: Awaited<
    ReturnType<typeof DailyTicketService.getTicketManagementOverviewSummary>
  >,
): WorkboardSummaryCounts {
  return {
    total: overview.totals.total,
    open: overview.totals.unassigned,
    assigned: overview.totals.assigned,
    close: overview.totals.close,
  };
}

interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
  kpiSummary: KpiSummaryCounts;
  bucketSummary: BucketSummaryCounts;
  bucketBreakdown: BucketBreakdownCounts;
  workboardSummary: WorkboardSummaryCounts;
  selectedBucket: string;
}

const KPI_CUSTOMER_JENIS = new Set([
  'reguler',
  'datin',
  'non-datin',
  'tsel',
  'vpn-ip',
  'dwdm',
  'astinet',
  'metro-e',
  'indibiz',
  'reseller',
  'wifi-id',
]);

function normalizeBucketText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeBucketCompact(value: string | null | undefined): string {
  return normalizeBucketText(value).replace(/\s+/g, '');
}

function textContainsAny(
  value: string | null | undefined,
  terms: readonly string[],
): boolean {
  const lower = normalizeBucketText(value);
  const compact = normalizeBucketCompact(value);
  return terms.some((term) => {
    const needle = term.toLowerCase();
    return (
      lower.includes(needle) || compact.includes(needle.replace(/\s+/g, ''))
    );
  });
}

function isTechnicalFlag(value: string | null | undefined): boolean {
  return normalizeBucketText(value) === 'technical';
}

function isNonTechnicalFlag(value: string | null | undefined): boolean {
  const lower = normalizeBucketText(value);
  return (
    lower.includes('nontechnical') ||
    lower.includes('non technical') ||
    lower.includes('billing')
  );
}

function classifyBucket(row: RekapTicketRow): BucketKey {
  const st = (row.source_ticket ?? '').toUpperCase();
  const path = row.classification_path ?? '';
  const summary = normalizeBucketText(row.summary);
  const isCust = st === 'CUSTOMER';
  const isPro = st === 'PROACTIVE';

  if (path === 'Z_PERMINTAAN_044') return 'obsolete';

  const jt1Raw = normalizeBucketText(row.jenis_tiket_1);
  const jt1 = normalizeJenis(row.jenis_tiket_1);
  const jt2 = normalizeJenis(row.jenis_tiket_2);
  const isSqmJt1 =
    jt1Raw.includes('sqm') || jt1 === 'sqm' || jt1 === 'sqm-ccan';

  const isNonTech =
    (isCust || isPro) &&
    (isNonTechnicalFlag(row.classification_flag) ||
      jt1 === 'unknown' ||
      jt1 === 'permintaan' ||
      jt1 === 'infracare' ||
      jt1 === 'billing' ||
      jt1 === 'digital-spbu' ||
      jt1 === 'non-numbering' ||
      jt2 === 'digital-spbu' ||
      jt1Raw === '' ||
      jt1Raw.includes('unknown'));
  if (isNonTech) return 'nonTechnical';

  if (isPro) {
    if (isSqmJt1 && summary.startsWith('[sqm-update]')) return 'sqmUpdate';
    if (isSqmJt1 && !summary.startsWith('[sqm-update]')) return 'kpiProactive';
    if (jt1 === 'unspec' || jt1 === 'unspec-b2b') return 'nonKpiUnspec';
  }

  if (
    isCust &&
    jt1 &&
    KPI_CUSTOMER_JENIS.has(jt1) &&
    !textContainsAny(row.jenis_tiket_1, [
      'unknown',
      'permintaan',
      'billing',
      'infracare',
      'digital_spbu',
      'digital spbu',
    ]) &&
    !textContainsAny(row.jenis_tiket_2, [
      'unknown',
      'digital_spbu',
      'digital spbu',
    ])
  ) {
    return 'kpiCustomer';
  }

  if (isCust) return 'nonTechnical';
  if (isPro) return 'nonTechnical';
  return 'nonTechnical';
}

const BUCKET_FILTER_KEY: Record<string, BucketKey> = {
  kpi_customer: 'kpiCustomer',
  kpi_proactive: 'kpiProactive',
  non_kpi_unspec: 'nonKpiUnspec',
  non_technical: 'nonTechnical',

  sqm_update: 'sqmUpdate',
  obsolete: 'obsolete',
};

const BUCKET_VIEW_MEMBERS: Record<KpiBucketKey, BucketKey[]> = {
  all: [
    'kpiCustomer',
    'kpiProactive',
    'nonKpiUnspec',
    'nonTechnical',
    'sqmUpdate',
    'obsolete',
  ],
  kpi_customer: ['kpiCustomer'],
  kpi_proactive: ['kpiProactive'],
  non_kpi_unspec: ['nonKpiUnspec'],
  non_technical: ['nonTechnical'],
  sqm_update: ['sqmUpdate'],
  obsolete: ['obsolete'],
};

// Bump this whenever bucket classification or detail aggregation changes.
const REKAP_WORKORDER_CACHE_VERSION = 'v25';
const REKAP_OVERVIEW_CACHE_VERSION = 'v3';
const REKAP_TEKNISI_CACHE_VERSION = 'v1';

function filterRekapRowsByBucket(
  rows: RekapTicketRow[],
  bucket: KpiBucketKey,
): RekapTicketRow[] {
  const members = BUCKET_VIEW_MEMBERS[bucket] ?? BUCKET_VIEW_MEMBERS.all;
  if (bucket === 'all') return rows;

  if (bucket === 'kpi_customer') {
    return rows.filter((row) => {
      const source = normalizeBucketText(row.source_ticket);
      if (source === 'customer' && classifyBucket(row) !== 'obsolete')
        return true;
      const classified = classifyBucket(row);
      return classified === 'kpiProactive' || classified === 'sqmUpdate';
    });
  }

  return rows.filter((row) => members.includes(classifyBucket(row)));
}

function emptyBuckets(): BucketRecord {
  return {
    kpiCustomer: { open: 0, close: 0 },
    kpiProactive: { open: 0, close: 0 },
    nonKpiUnspec: { open: 0, close: 0 },
    nonTechnical: { open: 0, close: 0 },
    sqmUpdate: { open: 0, close: 0 },
    obsolete: { open: 0, close: 0 },
  };
}

function emptyWzBuckets(): BucketRecord {
  return { ...emptyBuckets() };
}

function emptyDetail(): DetailGroup {
  return { b2c: {}, b2b: {} };
}

function buildRekapResponse(
  ticketRows: RekapTicketRow[],
  teknisiRows: { sa_name: string; cnt: bigint }[],
  syncDate: string,
  kpiSummary: KpiSummaryCounts,
  bucket: string,
  workboardSummary: WorkboardSummaryCounts,
  bucketSummary: BucketSummaryCounts,
  bucketBreakdown: BucketBreakdownCounts,
  customerLegacyRows?: LegacyCustomerBucketRow[],
  customerSqmRows?: {
    proactive: RekapTicketRow[];
    sqmUpdate: RekapTicketRow[];
  },
): RekapResponse {
  const teknisiMap = new Map(
    teknisiRows.map((r) => [r.sa_name, Number(r.cnt)]),
  );
  const customerLegacyMap = customerLegacyRows
    ? buildCustomerLegacySummaryFromRows(customerLegacyRows)
    : null;
  const customerSqmProactiveMap = customerSqmRows?.proactive
    ? buildCustomerSqmSummaryFromRows(customerSqmRows.proactive, 'proactive')
    : null;
  const customerSqmUpdateMap = customerSqmRows?.sqmUpdate
    ? buildCustomerSqmSummaryFromRows(customerSqmRows.sqmUpdate, 'sqm_update')
    : null;

  const useJenis2 = bucket === 'kpi_proactive' || bucket === 'sqm_update';
  const useUnspec = bucket === 'non_kpi_unspec';

  const saMap = new Map<
    string,
    {
      area: string;
      saName: string;
      buckets: BucketRecord;
      detail: DetailGroup;
      sqm: { open: number; close: number; update: number };
      workzones: Map<string, WorkzoneRow>;
      jenisTiket: Record<string, SegCount>;
      totalOpen: number;
      totalClose: number;
      totalAll: number;
    }
  >();

  for (const row of ticketRows) {
    const key = row.sa_name;
    if (!saMap.has(key)) {
      saMap.set(key, {
        area: row.area,
        saName: row.sa_name,
        buckets: emptyBuckets(),
        detail: emptyDetail(),
        sqm: { open: 0, close: 0, update: 0 },
        workzones: new Map(),
        jenisTiket: {},
        totalOpen: 0,
        totalClose: 0,
        totalAll: 0,
      });
    }

    const sa = saMap.get(key)!;
    const ticketBucket = classifyBucket(row);
    const cnt = Number(row.cnt);
    const category = getTicketCategory(row.status, row.status_update);
    const open = category === 'close' ? 0 : cnt;
    const assigned = category === 'assigned' ? cnt : 0;
    const onProgress = category === 'on_progress' ? cnt : 0;
    const pending = category === 'pending' ? cnt : 0;
    const close = category === 'close' ? cnt : 0;
    const skipAllCustomerBucket =
      bucket === 'all' && ticketBucket === 'kpiCustomer';

    const jtKey = (row.jenis_tiket ?? 'UNKNOWN').toUpperCase();
    if (!sa.jenisTiket[jtKey]) sa.jenisTiket[jtKey] = { open: 0, close: 0 };
    sa.jenisTiket[jtKey].open += open;
    sa.jenisTiket[jtKey].close += close;

    sa.totalAll += cnt;
    const wzCode = row.workzone ?? 'UNKNOWN';
    if (!sa.workzones.has(wzCode)) {
      sa.workzones.set(wzCode, {
        workzone: wzCode,
        buckets: emptyWzBuckets(),
        detail: emptyDetail(),
        sqm: { open: 0, close: 0, update: 0 },
        totalOpen: 0,
        totalClose: 0,
        totalAll: 0,
      });
    }
    const wz = sa.workzones.get(wzCode)!;
    wz.totalAll += cnt;

    if (!skipAllCustomerBucket) {
      sa.buckets[ticketBucket].open += open;
      sa.buckets[ticketBucket].close += close;

      const seg = (row.customer_segment ?? '').toUpperCase();
      const segKey = seg === 'DCS' || seg === 'PL-TSEL' ? 'b2c' : 'b2b';
      const detailJenisSource =
        row.jenis_tiket_1 ?? row.jenis_tiket_2 ?? row.jenis_tiket;

      if (useJenis2) {
        const dtJenis = normalizeJenis(detailJenisSource);
        if (dtJenis) {
          const grp = sa.detail[segKey];
          if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
          grp[dtJenis].open += open;
          grp[dtJenis].close += close;
        }
      } else if (useUnspec) {
        const key = segKey === 'b2c' ? 'unspec' : 'unspec-b2b';
        const grp = sa.detail[segKey];
        if (!grp[key]) grp[key] = { open: 0, close: 0 };
        grp[key].open += open;
        grp[key].close += close;
      } else if (segKey === 'b2c') {
        const ct = (row.customer_type ?? '').toUpperCase();
        let ctKey = 'reguler';
        if (ct.includes('DIAMOND')) ctKey = 'diamond';
        else if (ct.includes('PLATINUM')) ctKey = 'platinum';
        else if (ct.includes('GOLD')) ctKey = 'gold';
        const grp = sa.detail.b2c;
        if (!grp[ctKey]) grp[ctKey] = { open: 0, close: 0 };
        grp[ctKey].open += open;
        grp[ctKey].close += close;
      } else {
        const dtJenis = normalizeJenis(row.jenis_tiket_1);
        if (dtJenis) {
          const grp = sa.detail.b2b;
          if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
          grp[dtJenis].open += open;
          grp[dtJenis].close += close;
        }
      }

      wz.buckets[ticketBucket].open += open;
      wz.buckets[ticketBucket].close += close;

      if (useJenis2) {
        const dtJenis = normalizeJenis(detailJenisSource);
        if (dtJenis) {
          const grp = wz.detail[segKey];
          if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
          grp[dtJenis].open += open;
          grp[dtJenis].close += close;
        }
      } else if (useUnspec) {
        const key = segKey === 'b2c' ? 'unspec' : 'unspec-b2b';
        const grp = wz.detail[segKey];
        if (!grp[key]) grp[key] = { open: 0, close: 0 };
        grp[key].open += open;
        grp[key].close += close;
      } else if (segKey === 'b2c') {
        const ct = (row.customer_type ?? '').toUpperCase();
        let ctKey = 'reguler';
        if (ct.includes('DIAMOND')) ctKey = 'diamond';
        else if (ct.includes('PLATINUM')) ctKey = 'platinum';
        else if (ct.includes('GOLD')) ctKey = 'gold';
        const grp = wz.detail.b2c;
        if (!grp[ctKey]) grp[ctKey] = { open: 0, close: 0 };
        grp[ctKey].open += open;
        grp[ctKey].close += close;
      } else {
        const dtJenis = normalizeJenis(row.jenis_tiket_1);
        if (dtJenis) {
          const grp = wz.detail.b2b;
          if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
          grp[dtJenis].open += open;
          grp[dtJenis].close += close;
        }
      }

      wz.totalOpen += open;
      wz.totalClose += close;
    }
  }

  if (customerLegacyMap) {
    let customerOpenTotal = 0;
    let customerCloseTotal = 0;

    for (const data of saMap.values()) {
      let customerOpen = 0;
      let customerClose = 0;

      for (const wz of data.workzones.values()) {
        const legacy = customerLegacyMap.get(
          buildMergeKey(data.area, data.saName, wz.workzone),
        );
        if (!legacy) continue;
        wz.buckets.kpiCustomer.open = legacy.open;
        wz.buckets.kpiCustomer.close = legacy.close;
        wz.totalOpen = Object.values(wz.buckets).reduce(
          (s, v) => s + v.open,
          0,
        );
        wz.totalClose = Object.values(wz.buckets).reduce(
          (s, v) => s + v.close,
          0,
        );
        customerOpen += legacy.open;
        customerClose += legacy.close;
      }

      const currentCustomer = data.buckets.kpiCustomer;
      data.buckets.kpiCustomer = { open: customerOpen, close: customerClose };
      data.totalOpen += customerOpen - currentCustomer.open;
      data.totalClose += customerClose - currentCustomer.close;
      customerOpenTotal += customerOpen;
      customerCloseTotal += customerClose;
    }

    bucketBreakdown.kpiCustomer = {
      ...bucketBreakdown.kpiCustomer,
      open: customerOpenTotal,
      close: customerCloseTotal,
    };
  }

  if (customerSqmProactiveMap || customerSqmUpdateMap) {
    for (const data of saMap.values()) {
      let sqmOpen = 0;
      let sqmClose = 0;
      let sqmUpdate = 0;

      for (const wz of data.workzones.values()) {
        const key = buildMergeKey(data.area, data.saName, wz.workzone);
        const pro = customerSqmProactiveMap?.get(key) ?? {
          open: 0,
          close: 0,
          update: 0,
        };
        const upd = customerSqmUpdateMap?.get(key) ?? {
          open: 0,
          close: 0,
          update: 0,
        };
        wz.sqm = {
          open: pro.open,
          close: pro.close + upd.close,
          update: upd.update,
        };
        sqmOpen += wz.sqm.open;
        sqmClose += wz.sqm.close;
        sqmUpdate += wz.sqm.update;
      }

      data.sqm = { open: sqmOpen, close: sqmClose, update: sqmUpdate };
    }
  }

  const hasCustomerSqmOverlay =
    bucket === 'kpi_customer' &&
    Boolean(customerSqmProactiveMap || customerSqmUpdateMap);

  const rows: SARow[] = [];
  let no = 1;
  for (const [saName, data] of saMap) {
    const teknisiMasuk = teknisiMap.get(saName) ?? 0;
    const totalOpen = Object.values(data.buckets).reduce(
      (s, v) => s + v.open,
      0,
    );
    const totalClose = Object.values(data.buckets).reduce(
      (s, v) => s + v.close,
      0,
    );
    const workzoneRows = Array.from(data.workzones.values()).sort((a, b) =>
      a.workzone.localeCompare(b.workzone),
    );

    for (const wz of workzoneRows) {
      if (!hasCustomerSqmOverlay) {
        wz.sqm = {
          open: wz.buckets.kpiProactive.open + wz.buckets.sqmUpdate.open,
          close: wz.buckets.kpiProactive.close + wz.buckets.sqmUpdate.close,
          update: wz.buckets.sqmUpdate.open,
        };
      }
    }

    if (!hasCustomerSqmOverlay) {
      data.sqm = {
        open: data.buckets.kpiProactive.open + data.buckets.sqmUpdate.open,
        close: data.buckets.kpiProactive.close + data.buckets.sqmUpdate.close,
        update: data.buckets.sqmUpdate.open,
      };
    }

    rows.push({
      no: no++,
      area: data.area,
      saName,
      teknisiMasuk,
      woPerTeknisi:
        teknisiMasuk > 0 ? (totalOpen / teknisiMasuk).toFixed(1) : '—',
      buckets: data.buckets,
      detail: data.detail,
      sqm: data.sqm,
      workzones: workzoneRows,
      totalOpen,
      totalClose,
      grandTotal: data.totalAll,
      jenisTiket: data.jenisTiket,
    });
  }

  rows.sort(
    (a, b) => a.area.localeCompare(b.area) || a.saName.localeCompare(b.saName),
  );

  return {
    title: 'REKAP WORKORDER ASSURANCE',
    subtitle: '',
    timestamp: new Date().toISOString(),
    syncDate,
    rows,
    totals: {},
    kpiSummary,
    bucketSummary,
    bucketBreakdown,
    workboardSummary,
    selectedBucket: bucket,
  };
}

function buildRekapTicketsCacheKey(
  role: string,
  userId: number,
  syncDate: string,
  bucket: KpiBucketKey,
  workzone?: string,
): string {
  return `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:raw:${syncDate}:${role}:${userId}:${bucket}:${workzone || 'all'}`;
}

function buildRekapOverviewCacheKey(
  role: string,
  userId: number,
  syncDate: string,
  workzone?: string,
): string {
  return `dashboard:rekap:${REKAP_OVERVIEW_CACHE_VERSION}:overview:${syncDate}:${role}:${userId}:${workzone || 'all'}`;
}

function buildRekapTeknisiCacheKey(
  syncDate: string,
  userId: number,
  scope: string,
): string {
  return `dashboard:rekap:${REKAP_TEKNISI_CACHE_VERSION}:teknisi:${syncDate}:${userId}:${scope}`;
}

function buildRekapBucketFilterSql(bucket: KpiBucketKey): string {
  if (bucket === 'all') return '1=1';
  if (bucket === 'kpi_customer') {
    return `(
      (LOWER(source_ticket) = 'customer' AND (classification_path IS NULL OR classification_path != 'Z_PERMINTAAN_044'))
      OR (${buildKpiBucketFilterSql('kpi_proactive')})
      OR (${buildKpiBucketFilterSql('sqm_update')})
    )`;
  }
  return buildKpiBucketFilterSql(bucket);
}

async function getFilteredRekapTickets(
  role: string,
  userId: number,
  syncDate: string,
  bucket: KpiBucketKey,
  workzone?: string,
  dept: 'all' | 'b2c' | 'b2b' = 'all',
): Promise<RekapTicketRow[]> {
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    bucket,
    workzone,
  );
  return getOrSetCache(
    cacheKey,
    async () => {
      const { start: todayStart } = getTodayWibRange();
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept,
          includeClosed: true,
          workzone,
        });
      const bucketWhere = buildRekapBucketFilterSql(bucket);
      const fullSql = `
    WITH ranked AS (
      SELECT
        a.nama_area                     AS area,
        sa.nama_sa                      AS sa_name,
        t.workzone,
        t.customer_type,
        t.customer_segment,
        COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
        t.status,
        LOWER(COALESCE(t.status_update, 'open')) AS status_update,
        t.closed_at,
        t.source_ticket,
        t.classification_flag,
        t.classification_path,
        t.summary,
        t.symptom,
        t.jenis_tiket_1,
        t.jenis_tiket_2,
        t.id_ticket,
        ROW_NUMBER() OVER (
          PARTITION BY t.id_ticket
          ORDER BY COALESCE(t.synced_at, t.closed_at, t.reported_date) DESC, t.id_ticket DESC
        ) AS rn
      FROM ticket t
      JOIN service_area sa ON sa.nama_sa = t.workzone
      JOIN area a          ON a.id_area = sa.area_id
      WHERE ${whereClause}
    )
    SELECT
      area,
      sa_name,
      workzone,
      customer_type,
      customer_segment,
      jenis_tiket,
      status,
      status_update,
      closed_at,
      source_ticket,
      classification_flag,
      classification_path,
      summary,
      symptom,
      jenis_tiket_1,
      jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ranked
    WHERE rn = 1
      AND (${bucketWhere})
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             summary, symptom, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;
      return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
    },
    60,
  );
}

async function getCustomerSqmOverlayTickets(
  role: string,
  userId: number,
  syncDate: string,
  workzone?: string,
): Promise<{ proactive: RekapTicketRow[]; sqmUpdate: RekapTicketRow[] }> {
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    'customer_sqm' as KpiBucketKey,
    workzone,
  );
  return getOrSetCache(
    cacheKey,
    async () => {
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: 'all',
          includeClosed: true,
          workzone,
        });
      const proactiveWhere = buildKpiBucketFilterSql('kpi_proactive');
      const sqmWhere = `LOWER(source_ticket) = 'proactive'
         AND (classification_path IS NULL OR classification_path != 'Z_PERMINTAAN_044')
         AND summary LIKE '[SQM-UPDATE]%'
         AND (LOWER(jenis_tiket_1) LIKE '%sqm%' OR LOWER(jenis_tiket_1) LIKE '%sqm-ccan%')`;

      const fullSql = `
    WITH ranked AS (
      SELECT
        a.nama_area                     AS area,
        sa.nama_sa                      AS sa_name,
        t.workzone,
        t.customer_type,
        t.customer_segment,
        COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
        t.status,
        LOWER(COALESCE(t.status_update, 'open')) AS status_update,
        t.closed_at,
        t.source_ticket,
        t.classification_flag,
        t.classification_path,
        t.summary,
        t.symptom,
        t.jenis_tiket_1,
        t.jenis_tiket_2,
        t.id_ticket,
        ROW_NUMBER() OVER (
          PARTITION BY t.id_ticket
          ORDER BY COALESCE(t.synced_at, t.closed_at, t.reported_date) DESC, t.id_ticket DESC
        ) AS rn
      FROM ticket t
      JOIN service_area sa ON sa.nama_sa = t.workzone
      JOIN area a          ON a.id_area = sa.area_id
      WHERE ${whereClause}
    )
    SELECT
      CASE
        WHEN (${proactiveWhere}) THEN 'proactive'
        WHEN (${sqmWhere}) THEN 'sqm_update'
      END AS overlay_kind,
      area,
      sa_name,
      workzone,
      customer_type,
      customer_segment,
      jenis_tiket,
      status,
      status_update,
      closed_at,
      source_ticket,
      classification_flag,
      classification_path,
      summary,
      symptom,
      jenis_tiket_1,
      jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ranked
    WHERE rn = 1
      AND ((${proactiveWhere}) OR (${sqmWhere}))
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path, overlay_kind,
             summary, symptom, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;
      const rows = await prisma.$queryRawUnsafe<CustomerSqmOverlayRow[]>(
        fullSql,
        ...params,
      );
      const proactive: RekapTicketRow[] = [];
      const sqmUpdate: RekapTicketRow[] = [];

      for (const row of rows) {
        const { overlay_kind: overlayKind, ...ticketRow } = row;
        if (overlayKind === 'proactive') {
          proactive.push(ticketRow);
        } else if (overlayKind === 'sqm_update') {
          sqmUpdate.push(ticketRow);
        }
      }

      return { proactive, sqmUpdate };
    },
    60,
  );
}

async function getLegacyCustomerBucketRows(
  role: string,
  userId: number,
  workzone?: string,
  dept: 'all' | 'b2c' | 'b2b' = 'all',
): Promise<LegacyCustomerBucketRow[]> {
  const [whereClause, params] =
    await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept,
      operationalBucket: ['kpi_customer'],
      includeClosed: true,
      workzone,
    });

  const fullSql = `
    WITH ranked AS (
      SELECT
        a.nama_area AS area,
        sa.nama_sa AS sa_name,
        t.workzone,
        t.status,
        LOWER(COALESCE(t.status_update, 'open')) AS status_update,
        t.id_ticket,
        ROW_NUMBER() OVER (
          PARTITION BY t.id_ticket
          ORDER BY COALESCE(t.synced_at, t.closed_at, t.reported_date) DESC, t.id_ticket DESC
        ) AS rn
      FROM ticket t
      JOIN service_area sa ON sa.nama_sa = t.workzone
      JOIN area a ON a.id_area = sa.area_id
      WHERE ${whereClause}
    )
    SELECT
      area,
      sa_name,
      workzone,
      status,
      status_update,
      COUNT(*) AS cnt
    FROM ranked
    WHERE rn = 1
    GROUP BY area, sa_name, workzone, status, status_update
    ORDER BY area, sa_name, workzone
  `;

  return prisma.$queryRawUnsafe<LegacyCustomerBucketRow[]>(fullSql, ...params);
}

async function getLegacyCustomerRekapTickets(
  role: string,
  userId: number,
  workzone?: string,
  dept: 'all' | 'b2c' | 'b2b' = 'all',
): Promise<RekapTicketRow[]> {
  const [whereClause, params] =
    await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept,
      operationalBucket: ['kpi_customer'],
      includeClosed: true,
      workzone,
    });

  const fullSql = `
    WITH ranked AS (
      SELECT
        a.nama_area                     AS area,
        sa.nama_sa                      AS sa_name,
        t.workzone,
        t.customer_type,
        t.customer_segment,
        COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
        t.status,
        LOWER(COALESCE(t.status_update, 'open')) AS status_update,
        t.closed_at,
        t.source_ticket,
        t.classification_flag,
        t.classification_path,
        t.summary,
        t.jenis_tiket_1,
        t.jenis_tiket_2,
        t.id_ticket,
        ROW_NUMBER() OVER (
          PARTITION BY t.id_ticket
          ORDER BY COALESCE(t.synced_at, t.closed_at, t.reported_date) DESC, t.id_ticket DESC
        ) AS rn
      FROM ticket t
      JOIN service_area sa ON sa.nama_sa = t.workzone
      JOIN area a          ON a.id_area = sa.area_id
      WHERE ${whereClause}
    )
    SELECT
      area,
      sa_name,
      workzone,
      customer_type,
      customer_segment,
      jenis_tiket,
      status,
      status_update,
      closed_at,
      source_ticket,
      classification_flag,
      classification_path,
      summary,
      jenis_tiket_1,
      jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ranked
    WHERE rn = 1
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             summary, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;

  return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
}

async function getCustomerRekapTicketsSafe(
  role: string,
  userId: number,
  today: string,
  workzone?: string,
): Promise<RekapTicketRow[]> {
  try {
    const [b2cRows, b2bRows] = await Promise.all([
      getLegacyCustomerRekapTickets(role, userId, workzone, 'b2c'),
      getLegacyCustomerRekapTickets(role, userId, workzone, 'b2b'),
    ]);
    return [...b2cRows, ...b2bRows];
  } catch (error) {
    logger.warn(
      'Legacy customer rekap failed, falling back to standard customer rekap',
      {
        role,
        userId,
        today,
        error: String((error as Error)?.message ?? error),
      },
    );
    const [b2cRows, b2bRows] = await Promise.all([
      getFilteredRekapTickets(
        role,
        userId,
        today,
        'kpi_customer',
        workzone,
        'b2c',
      ),
      getFilteredRekapTickets(
        role,
        userId,
        today,
        'kpi_customer',
        workzone,
        'b2b',
      ),
    ]);
    return [...b2cRows, ...b2bRows];
  }
}

async function getRekapOverview(
  role: string,
  userId: number,
  syncDate: string,
  workzone?: string,
): Promise<
  Awaited<
    ReturnType<typeof DailyTicketService.getTicketManagementOverviewSummary>
  >
> {
  const cacheKey = buildRekapOverviewCacheKey(role, userId, syncDate, workzone);
  return getOrSetCache(
    cacheKey,
    () =>
      DailyTicketService.getTicketManagementOverviewSummary(
        role,
        userId,
        workzone,
      ),
    120,
  );
}

async function getRekapTeknisiRows(
  syncDate: string,
  userId: number,
  workzones: string[] | null,
): Promise<{ sa_name: string; cnt: bigint }[]> {
  const scope =
    workzones && workzones.length > 0
      ? workzones.slice().sort().join(',')
      : 'all';
  const cacheKey = buildRekapTeknisiCacheKey(syncDate, userId, scope);
  return getOrSetCache(
    cacheKey,
    async () => prisma.$queryRaw<{ sa_name: string; cnt: bigint }[]>`
      SELECT sa.nama_sa AS sa_name, COUNT(DISTINCT a.technician_id) AS cnt
      FROM technician_attendance a
      JOIN service_area sa ON sa.id_sa = a.workzone_id
      JOIN users u ON u.id_user = a.technician_id
      WHERE a.date = ${syncDate}
        AND u.role_id = 4
      ${workzones && workzones.length > 0 ? Prisma.sql`AND sa.nama_sa IN (${Prisma.join(workzones)})` : Prisma.sql``}
      GROUP BY sa.nama_sa
    `,
    120,
  );
}

async function getDailyOpenSummary(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
): Promise<BucketSummaryCounts> {
  const result = await DailyTicketService.getDailyTicketTable(role, userId, {
    dept: 'all',
    operationalBucket: [bucket],
    includeClosed: true,
    includeValidasi: false,
    includeValidasiTickets: false,
    includeOptions: false,
    includeSummary: true,
    page: 1,
    limit: 1,
  });

  return {
    total: result.summary.total,
    open: result.summary.open,
    assigned: result.summary.assigned,
    close: result.summary.close,
  };
}

async function getTicketManagementBucketSummary(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
  workzone?: string,
): Promise<BucketSummaryCounts> {
  const [openResult, closeResult] = await Promise.all([
    DailyTicketService.getDailyTicketTable(role, userId, {
      dept: 'all',
      operationalBucket: [bucket],
      workzone,
      includeValidasi: false,
      includeValidasiTickets: false,
      includeOptions: false,
      page: 1,
      limit: 1,
    }),
    DailyTicketService.getDailyTicketTable(role, userId, {
      dept: 'all',
      operationalBucket: [bucket],
      ticketStatus: CLOSE_STATUS_VALUES,
      includeClosed: true,
      workzone,
      includeValidasi: false,
      includeValidasiTickets: false,
      includeOptions: false,
      page: 1,
      limit: 1,
    }),
  ]);

  return buildTicketManagementBucketSummary(
    openResult.summary,
    closeResult.summary,
  );
}

async function getDailyBucketSummaryMatrix(
  role: string,
  userId: number,
): Promise<
  Awaited<ReturnType<typeof DailyTicketService.getKpiBucketSummaryMatrix>>
> {
  return DailyTicketService.getKpiBucketSummaryMatrix(role, userId, {
    dept: 'all',
    includeClosed: true,
  });
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'rekap-workorder',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';
    const requestedWorkzone = String(
      request.nextUrl.searchParams.get('workzone') || '',
    ).trim();

    const workzones = isSuperAdmin
      ? null
      : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;
    const requestedBucket = request.nextUrl.searchParams.get('bucket') ?? 'all';
    const bucket: KpiBucketKey =
      requestedBucket === 'kpi_customer' ||
      requestedBucket === 'kpi_proactive' ||
      requestedBucket === 'non_kpi_unspec' ||
      requestedBucket === 'non_technical' ||
      requestedBucket === 'sqm_update' ||
      requestedBucket === 'obsolete'
        ? requestedBucket
        : 'all';
    const selectedWorkzone =
      requestedWorkzone.length > 0 ? requestedWorkzone : undefined;

    if (
      !isSuperAdmin &&
      selectedWorkzone &&
      !(workzones ?? []).includes(selectedWorkzone)
    ) {
      return NextResponse.json({
        rows: [],
        totals: {},
        timestamp: new Date().toISOString(),
        syncDate: today,
        title: 'REKAP WORKORDER ASSURANCE',
        subtitle: '',
        kpiSummary: {
          total: 0,
          kpiCustomer: 0,
          kpiProactive: 0,
          nonKpiUnspec: 0,
          nonTechnical: 0,
          sqmUpdate: 0,
          obsolete: 0,
        },
        bucketSummary: { total: 0, open: 0, assigned: 0, close: 0 },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, close: 0 },
        },
        workboardSummary: { total: 0, open: 0, assigned: 0, close: 0 },
        selectedBucket: bucket,
      });
    }

    const scopeWorkzones = selectedWorkzone ? [selectedWorkzone] : workzones;

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({
        rows: [],
        totals: {},
        timestamp: new Date().toISOString(),
        syncDate: today,
        title: 'REKAP WORKORDER ASSURANCE',
        subtitle: '',
        kpiSummary: {
          total: 0,
          kpiCustomer: 0,
          kpiProactive: 0,
          nonKpiUnspec: 0,
          nonTechnical: 0,
          sqmUpdate: 0,
          obsolete: 0,
        },
        bucketSummary: { total: 0, open: 0, assigned: 0, close: 0 },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, close: 0 },
        },
        workboardSummary: { total: 0, open: 0, assigned: 0, close: 0 },
        selectedBucket: bucket,
      });
    }

    const cacheKey = `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (scopeWorkzones ?? []).sort().join(',')}:${bucket}`;

    const data = await getOrSetCache(
      cacheKey,
      async () => {
        const startedAt = Date.now();
        const [
          ticketRowsAll,
          teknisiRows,
          customerLegacyRows,
          customerSqmOverlayRows,
          dailySummaryEntries,
        ] = await Promise.all([
          bucket === 'kpi_customer'
            ? getCustomerRekapTicketsSafe(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
              )
            : getFilteredRekapTickets(
                decoded.role,
                decoded.id_user,
                today,
                bucket,
                selectedWorkzone,
              ),
          getRekapTeknisiRows(today, decoded.id_user, scopeWorkzones),
          bucket === 'all' || bucket === 'kpi_customer'
            ? Promise.all([
                getLegacyCustomerBucketRows(
                  decoded.role,
                  decoded.id_user,
                  selectedWorkzone,
                  'b2c',
                ),
                getLegacyCustomerBucketRows(
                  decoded.role,
                  decoded.id_user,
                  selectedWorkzone,
                  'b2b',
                ),
              ]).then(([b2cRows, b2bRows]) => [...b2cRows, ...b2bRows])
            : Promise.resolve([] as LegacyCustomerBucketRow[]),
          bucket === 'kpi_customer'
            ? getCustomerSqmOverlayTickets(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
              ).catch((error) => {
                logger.warn('Customer sqm overlay failed', {
                  role: decoded.role,
                  userId: decoded.id_user,
                  today,
                  error: String((error as Error)?.message ?? error),
                });
                return {
                  proactive: [] as RekapTicketRow[],
                  sqmUpdate: [] as RekapTicketRow[],
                };
              })
            : Promise.resolve({
                proactive: [] as RekapTicketRow[],
                sqmUpdate: [] as RekapTicketRow[],
              }),
          Promise.all(
            [
              { key: 'kpi_customer', bucket: 'kpi_customer' as const },
              { key: 'kpi_proactive', bucket: 'kpi_proactive' as const },
              { key: 'non_kpi_unspec', bucket: 'non_kpi_unspec' as const },
              { key: 'non_technical', bucket: 'non_technical' as const },
              { key: 'sqm_update', bucket: 'sqm_update' as const },
              { key: 'obsolete', bucket: 'obsolete' as const },
            ].map(async ({ key, bucket: bucketKey }) => {
              const summary = await getTicketManagementBucketSummary(
                decoded.role,
                decoded.id_user,
                bucketKey,
                selectedWorkzone,
              );
              return [key, summary] as const;
            }),
          ),
        ]);
        const fetchedAt = Date.now();
        const dailySummaryMap = Object.fromEntries(
          dailySummaryEntries,
        ) as Partial<Record<KpiBucketKey, BucketSummaryCounts>>;
        const workboardSummary = buildBucketSummaryFromDailySummaries(
          dailySummaryMap,
          'all',
        );
        const bucketBreakdown =
          buildBucketBreakdownFromDailySummaries(dailySummaryMap);
        const kpiSummary = {
          total: workboardSummary.total,
          kpiCustomer: dailySummaryMap.kpi_customer?.total ?? 0,
          kpiProactive: dailySummaryMap.kpi_proactive?.total ?? 0,
          nonKpiUnspec: dailySummaryMap.non_kpi_unspec?.total ?? 0,
          nonTechnical: dailySummaryMap.non_technical?.total ?? 0,
          sqmUpdate: dailySummaryMap.sqm_update?.total ?? 0,
          obsolete: dailySummaryMap.obsolete?.total ?? 0,
        };

        const ticketRows = filterRekapRowsByBucket(ticketRowsAll, bucket);
        const customerCustomerRows =
          bucket === 'all'
            ? await getCustomerRekapTicketsSafe(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
              )
            : ticketRows;
        const bucketSummary =
          bucket === 'all'
            ? buildBucketSummaryFromRows(ticketRowsAll)
            : bucket === 'kpi_customer'
              ? (dailySummaryMap.kpi_customer ??
                buildBucketSummaryFromRows(ticketRows))
              : buildBucketSummaryFromRows(ticketRows);

        const selectedBucketSummary = buildSelectedBucketSummary(
          bucket,
          ticketRows,
          kpiSummary,
        );
        const normalizedWorkboardSummary = {
          total: workboardSummary.total,
          open: workboardSummary.open,
          assigned: workboardSummary.assigned,
          close: workboardSummary.close,
        };

        logger.info('Rekap workorder timings', {
          bucket,
          userId: decoded.id_user,
          role: decoded.role,
          totalMs: Date.now() - startedAt,
          fetchMs: fetchedAt - startedAt,
          rows: ticketRowsAll.length,
          filteredRows: ticketRows.length,
          teknisiRows: teknisiRows.length,
        });

        return buildRekapResponse(
          ticketRows,
          teknisiRows,
          today,
          selectedBucketSummary,
          bucket,
          normalizedWorkboardSummary,
          bucketSummary,
          bucketBreakdown,
          customerLegacyRows,
          bucket === 'kpi_customer'
            ? {
                proactive: customerSqmOverlayRows.proactive,
                sqmUpdate: customerSqmOverlayRows.sqmUpdate,
              }
            : undefined,
        );
      },
      120,
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    logger.error('Rekap workorder error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
