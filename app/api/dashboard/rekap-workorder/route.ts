import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCacheSwr } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getWorkzonesForUser, resolveBranchScope } from '@/app/helpers/ticket.helpers';
import { toWibDateString, getTodayWibRange } from '@/lib/timezone';
import { toZonedTime } from 'date-fns-tz';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { getTicketCategory } from '@/app/libs/ticket-utils';
import { isQueryOverloadError, withMaxExecutionTime } from '@/lib/sql/max-execution-time';
import {
  buildKpiBucketFilterSql,
  type KpiBucketKey,
} from '@/app/libs/services/kpi-bucket-sql';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { logger } from '@/lib/observability/logger';
import {
  classifyBucket,
  normalizeB2BJenis,
  normalizeBucketText,
} from '@/lib/rekap/rekap-classify';
import { buildRekapBucketFilterSql } from '@/lib/rekap/rekap-cell-filter';
import { deptByJenis } from '@/lib/dept';
import { isSqmUpdateReasonSql } from '@/lib/sqm-update';

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
  is_sqm_update: boolean;
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

interface StatusCounts {
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

interface AgingRow {
  saName: string;
  openCount: number;
  oldestAt: Date | string | null;
  g24: number;
  g48: number;
  g72: number;
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
  netral: Record<string, SegCount>;
}

// Agregat Open/Close per segmen customer (B2C = customer_segment IN
// ('DCS','PL-TSEL'), selain itu B2B) — selalu terisi terlepas dari mode
// filter bucket, beda dari `detail.b2c`/`detail.b2b` yang granular per
// jenis tiket dan cuma terisi bermakna di mode tertentu.
interface SegmentTotal {
  b2c: SegCount;
  b2b: SegCount;
  netral: SegCount;
}

function emptySegmentTotal(): SegmentTotal {
  return {
    b2c: { open: 0, close: 0 },
    b2b: { open: 0, close: 0 },
    netral: { open: 0, close: 0 },
  };
}

interface WorkzoneRow {
  workzone: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  gamas: SegCount;
  status: StatusCounts;
  segmentTotal: SegmentTotal;
  totalOpen: number;
  totalClose: number;
  totalAll: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  teknisiTerdaftar: number;
  teknisiCoverage: number;
  woPerTeknisi: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  gamas: SegCount;
  status: StatusCounts;
  workzones: WorkzoneRow[];
  segmentTotal: SegmentTotal;
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
  onProgress: number;
  pending: number;
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
  onProgress: number;
  pending: number;
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
        if (category === 'assigned') acc.assigned += cnt;
        else if (category === 'on_progress') acc.onProgress += cnt;
        else if (category === 'pending') acc.pending += cnt;
      }
      return acc;
    },
    {
      total: 0,
      open: 0,
      assigned: 0,
      onProgress: 0,
      pending: 0,
      close: 0,
    },
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
        if (statusUpdate === 'on_progress') acc.onProgress += cnt;
        else if (statusUpdate === 'pending') acc.pending += cnt;
      }

      acc.open += cnt;
      return acc;
    },
    {
      total: 0,
      open: 0,
      assigned: 0,
      onProgress: 0,
      pending: 0,
      close: 0,
    },
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

function buildCustomerGamasSummaryFromRows(
  rows: RekapTicketRow[],
): Map<string, SegCount> {
  const map = new Map<string, SegCount>();

  for (const row of rows) {
    const key = buildMergeKey(row.area, row.sa_name, row.workzone);
    const cnt = Number(row.cnt ?? 0);
    const category = getTicketCategory(row.status, row.status_update);
    if (!map.has(key)) {
      map.set(key, { open: 0, close: 0 });
    }
    const entry = map.get(key)!;
    if (category === 'close') entry.close += cnt;
    else entry.open += cnt;
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
      acc.onProgress += item.onProgress;
      acc.pending += item.pending;
      acc.close += item.close;
      return acc;
    },
    {
      total: 0,
      open: 0,
      assigned: 0,
      onProgress: 0,
      pending: 0,
      close: 0,
    },
  );
}

function buildBucketBreakdownFromDailySummaries(
  dailySummaryMap: Partial<Record<KpiBucketKey, BucketSummaryCounts>>,
): BucketBreakdownCounts {
  const pick = (bucket: KpiBucketKey): BucketSummaryCounts =>
    dailySummaryMap[bucket] ?? {
      total: 0,
      open: 0,
      assigned: 0,
      onProgress: 0,
      pending: 0,
      close: 0,
    };

  return {
    kpiCustomer: pick('kpi_customer'),
    kpiProactive: pick('kpi_proactive'),
    nonKpiUnspec: pick('non_kpi_unspec'),
    nonTechnical: pick('non_technical'),
    sqmUpdate: pick('sqm_update'),
    obsolete: pick('obsolete'),
  };
}

function buildBucketBreakdownFromRekapRows(
  rows: RekapTicketRow[],
): BucketBreakdownCounts {
  const bucketRows = {
    kpiCustomer: [] as RekapTicketRow[],
    kpiProactive: [] as RekapTicketRow[],
    nonKpiUnspec: [] as RekapTicketRow[],
    nonTechnical: [] as RekapTicketRow[],
    sqmUpdate: [] as RekapTicketRow[],
    obsolete: [] as RekapTicketRow[],
  };
  for (const row of rows) {
    const bucket = classifyBucket(row);
    if (bucket in bucketRows) bucketRows[bucket].push(row);
  }
  return {
    kpiCustomer: buildBucketSummaryFromRows(bucketRows.kpiCustomer),
    kpiProactive: buildBucketSummaryFromRows(bucketRows.kpiProactive),
    nonKpiUnspec: buildBucketSummaryFromRows(bucketRows.nonKpiUnspec),
    nonTechnical: buildBucketSummaryFromRows(bucketRows.nonTechnical),
    sqmUpdate: buildBucketSummaryFromRows(bucketRows.sqmUpdate),
    obsolete: buildBucketSummaryFromRows(bucketRows.obsolete),
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
      onProgress: 0,
      pending: 0,
      close: cards.kpiCustomer.close,
    },
    kpiProactive: {
      total: cards.kpiProactive.total,
      open: cards.kpiProactive.open,
      assigned: cards.kpiProactive.assigned,
      onProgress: 0,
      pending: 0,
      close: cards.kpiProactive.close,
    },
    nonKpiUnspec: {
      total: cards.nonKpiUnspec.total,
      open: cards.nonKpiUnspec.open,
      assigned: cards.nonKpiUnspec.assigned,
      onProgress: 0,
      pending: 0,
      close: cards.nonKpiUnspec.close,
    },
    nonTechnical: {
      total: cards.nonTechnical.total,
      open: cards.nonTechnical.open,
      assigned: cards.nonTechnical.assigned,
      onProgress: 0,
      pending: 0,
      close: cards.nonTechnical.close,
    },
    sqmUpdate: {
      total: cards.sqmUpdate.total,
      open: cards.sqmUpdate.open,
      assigned: cards.sqmUpdate.assigned,
      onProgress: 0,
      pending: 0,
      close: cards.sqmUpdate.close,
    },
    obsolete: {
      total: cards.obsolete.total,
      open: cards.obsolete.open,
      assigned: cards.obsolete.assigned,
      onProgress: 0,
      pending: 0,
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
    onProgress: 0,
    pending: 0,
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
    onProgress: 0,
    pending: 0,
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
  aging: AgingRow[];
  kpiSummary: KpiSummaryCounts;
  bucketSummary: BucketSummaryCounts;
  bucketBreakdown: BucketBreakdownCounts;
  workboardSummary: WorkboardSummaryCounts;
  selectedBucket: string;
}

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
const REKAP_WORKORDER_CACHE_VERSION = 'v28';
const REKAP_TEKNISI_CACHE_VERSION = 'v2';

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
  return { b2c: {}, b2b: {}, netral: {} };
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
  customerGamasRows?: RekapTicketRow[],
  expectedSAs?: { area: string; saName: string }[],
  teknisiRegistered?: { sa_name: string; cnt: bigint }[],
  aging: AgingRow[] = [],
): RekapResponse {
  const teknisiMap = new Map(
    teknisiRows.map((r) => [r.sa_name, Number(r.cnt)]),
  );
  const teknisiRegisteredMap = new Map(
    (teknisiRegistered ?? []).map((r) => [r.sa_name, Number(r.cnt)]),
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
  const customerGamasMap = customerGamasRows
    ? buildCustomerGamasSummaryFromRows(customerGamasRows)
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
      gamas: SegCount;
      status: StatusCounts;
      workzones: Map<string, WorkzoneRow>;
      jenisTiket: Record<string, SegCount>;
      segmentTotal: SegmentTotal;
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
        gamas: { open: 0, close: 0 },
        status: {
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        workzones: new Map(),
        jenisTiket: {},
        segmentTotal: emptySegmentTotal(),
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
    const stOpen = category === 'open' ? cnt : 0;

    sa.status.open += stOpen;
    sa.status.assigned += assigned;
    sa.status.onProgress += onProgress;
    sa.status.pending += pending;
    sa.status.close += close;

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
        gamas: { open: 0, close: 0 },
        status: {
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        segmentTotal: emptySegmentTotal(),
        totalOpen: 0,
        totalClose: 0,
        totalAll: 0,
      });
    }
    const wz = sa.workzones.get(wzCode)!;
    wz.totalAll += cnt;
    wz.status.open += stOpen;
    wz.status.assigned += assigned;
    wz.status.onProgress += onProgress;
    wz.status.pending += pending;
    wz.status.close += close;

    sa.buckets[ticketBucket].open += open;
    sa.buckets[ticketBucket].close += close;
    const segKey = deptByJenis(row.jenis_tiket_2, row.customer_segment);
    sa.segmentTotal[segKey].open += open;
    sa.segmentTotal[segKey].close += close;
    wz.segmentTotal[segKey].open += open;
    wz.segmentTotal[segKey].close += close;
    const detailJenisSource =
      row.jenis_tiket_1 ?? row.jenis_tiket_2 ?? row.jenis_tiket;

    if (useJenis2) {
      const dtJenis =
        segKey === 'b2b'
          ? normalizeB2BJenis(detailJenisSource)
          : normalizeJenis(detailJenisSource);
      if (dtJenis) {
        const grp = sa.detail[segKey];
        if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
        grp[dtJenis].open += open;
        grp[dtJenis].close += close;
      }
    } else if (useUnspec) {
      const key =
        segKey === 'b2c'
          ? 'unspec'
          : segKey === 'netral'
            ? 'unspec-netral'
            : 'unspec-b2b';
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
    } else if (segKey === 'netral') {
      const dtJenis =
        normalizeJenis(detailJenisSource) ||
        normalizeB2BJenis(row.jenis_tiket_1);
      if (dtJenis) {
        const grp = sa.detail.netral;
        if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
        grp[dtJenis].open += open;
        grp[dtJenis].close += close;
      } else {
        const grp = sa.detail.netral;
        const key = 'netral';
        if (!grp[key]) grp[key] = { open: 0, close: 0 };
        grp[key].open += open;
        grp[key].close += close;
      }
    } else {
      const dtJenis = normalizeB2BJenis(row.jenis_tiket_1);
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
      const dtJenis =
        segKey === 'b2b'
          ? normalizeB2BJenis(detailJenisSource)
          : normalizeJenis(detailJenisSource);
      if (dtJenis) {
        const grp = wz.detail[segKey];
        if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
        grp[dtJenis].open += open;
        grp[dtJenis].close += close;
      }
    } else if (useUnspec) {
      const key =
        segKey === 'b2c'
          ? 'unspec'
          : segKey === 'netral'
            ? 'unspec-netral'
            : 'unspec-b2b';
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
    } else if (segKey === 'netral') {
      const dtJenis =
        normalizeJenis(detailJenisSource) ||
        normalizeB2BJenis(row.jenis_tiket_1);
      if (dtJenis) {
        const grp = wz.detail.netral;
        if (!grp[dtJenis]) grp[dtJenis] = { open: 0, close: 0 };
        grp[dtJenis].open += open;
        grp[dtJenis].close += close;
      } else {
        const grp = wz.detail.netral;
        const key = 'netral';
        if (!grp[key]) grp[key] = { open: 0, close: 0 };
        grp[key].open += open;
        grp[key].close += close;
      }
    } else {
      const dtJenis = normalizeB2BJenis(row.jenis_tiket_1);
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

  if (bucket === 'kpi_customer' && customerLegacyMap) {
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

  if (customerGamasMap) {
    for (const data of saMap.values()) {
      let gamasOpen = 0;
      let gamasClose = 0;

      for (const wz of data.workzones.values()) {
        const key = buildMergeKey(data.area, data.saName, wz.workzone);
        const g = customerGamasMap.get(key) ?? { open: 0, close: 0 };
        wz.gamas = g;
        gamasOpen += wz.gamas.open;
        gamasClose += wz.gamas.close;
      }

      data.gamas = { open: gamasOpen, close: gamasClose };
    }
  }

  if (expectedSAs) {
    for (const { area, saName } of expectedSAs) {
      if (saMap.has(saName)) continue;
      saMap.set(saName, {
        area,
        saName,
        buckets: emptyBuckets(),
        detail: emptyDetail(),
        sqm: { open: 0, close: 0, update: 0 },
        gamas: { open: 0, close: 0 },
        status: {
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        workzones: new Map(),
        jenisTiket: {},
        segmentTotal: emptySegmentTotal(),
        totalOpen: 0,
        totalClose: 0,
        totalAll: 0,
      });
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
      teknisiTerdaftar: teknisiRegisteredMap.get(saName) ?? 0,
      teknisiCoverage:
        (teknisiRegisteredMap.get(saName) ?? 0) > 0
          ? Math.round((teknisiMasuk / (teknisiRegisteredMap.get(saName) ?? 0)) * 100)
          : (teknisiMasuk > 0 ? 100 : 0),
      woPerTeknisi:
        teknisiMasuk > 0 ? (totalOpen / teknisiMasuk).toFixed(1) : '—',
      buckets: data.buckets,
      detail: data.detail,
      sqm: data.sqm,
      gamas: data.gamas,
      status: data.status,
      workzones: workzoneRows,
      segmentTotal: data.segmentTotal,
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
    aging,
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
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): string {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  return `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:raw:${syncDate}:${role}:${userId}:${bucket}:${normalizedDept}:${workzone || 'all'}:${branchId ?? ''}`;
}

function buildRekapTeknisiCacheKey(
  syncDate: string,
  userId: number,
  scope: string,
): string {
  return `dashboard:rekap:${REKAP_TEKNISI_CACHE_VERSION}:teknisi:${syncDate}:${userId}:${scope}`;
}

function buildRekapTeknisiRegisteredCacheKey(
  userId: number,
  scope: string,
): string {
  return `dashboard:rekap:${REKAP_TEKNISI_CACHE_VERSION}:teknisi-registered:${userId}:${scope}`;
}

function buildRekapAgingCacheKey(
  role: string,
  userId: number,
  bucket: string,
  workzone: string | undefined,
  branchId?: number | string,
): string {
  return `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:aging:${role}:${userId}:${bucket}:${workzone || 'all'}:${branchId ?? ''}`;
}

async function getFilteredRekapTickets(
  role: string,
  userId: number,
  syncDate: string,
  bucket: KpiBucketKey,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): Promise<RekapTicketRow[]> {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    bucket,
    workzone,
    branchId,
    normalizedDept,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const { start: todayStart } = getTodayWibRange();
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: normalizedDept,
          includeClosed: true,
          workzone,
          branchId,
        });
      const bucketWhere = buildRekapBucketFilterSql(bucket);
      const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
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
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
      AND (${bucketWhere})
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
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
  branchId?: number | string,
): Promise<{ proactive: RekapTicketRow[]; sqmUpdate: RekapTicketRow[] }> {
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    'customer_sqm' as KpiBucketKey,
    workzone,
    branchId,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: 'all',
          includeClosed: true,
          workzone,
          branchId,
        });
      const proactiveWhere = buildKpiBucketFilterSql('kpi_proactive');
      const sqmWhere = `LOWER(source_ticket) = 'proactive'
         AND (classification_path IS NULL OR classification_path != 'Z_PERMINTAAN_044')
         AND ${isSqmUpdateReasonSql('')}
         AND (LOWER(jenis_tiket_1) LIKE '%sqm%' OR LOWER(jenis_tiket_1) LIKE '%sqm-ccan%')`;

      const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      CASE
        WHEN (${proactiveWhere}) THEN 'proactive'
        WHEN (${sqmWhere}) THEN 'sqm_update'
      END AS overlay_kind,
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
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
      AND ((${proactiveWhere}) OR (${sqmWhere}))
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path, overlay_kind,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
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

async function getCustomerGamasOverlayTickets(
  role: string,
  userId: number,
  syncDate: string,
  workzone?: string,
  branchId?: number | string,
): Promise<RekapTicketRow[]> {
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    'customer_gamas' as KpiBucketKey,
    workzone,
    branchId,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: 'all',
          includeClosed: true,
          workzone,
          branchId,
        });
      const gamasWhere = `LOWER(t.source_ticket) = 'gamas'`;

      const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
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
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
      AND ${gamasWhere}
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;
      return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
    },
    60,
  );
}

async function getLegacyCustomerBucketRows(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): Promise<LegacyCustomerBucketRow[]> {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  const [whereClause, params] =
    await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept: normalizedDept,
      operationalBucket: ['kpi_customer'],
      includeClosed: true,
      workzone,
      branchId,
    });

  const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      a.nama_area AS area,
      sa.nama_sa AS sa_name,
      t.workzone,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a ON a.id_area = sa.area_id
    WHERE ${whereClause}
    GROUP BY area, sa_name, workzone, status, status_update
    ORDER BY area, sa_name, workzone
  `;

  return prisma.$queryRawUnsafe<LegacyCustomerBucketRow[]>(fullSql, ...params);
}

async function getLegacyCustomerRekapTickets(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): Promise<RekapTicketRow[]> {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  const [whereClause, params] =
    await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept: normalizedDept,
      operationalBucket: ['kpi_customer'],
      includeClosed: true,
      workzone,
      branchId,
    });

  const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
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
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;

  return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
}

async function getCustomerRekapTicketsSafe(
  role: string,
  userId: number,
  today: string,
  workzone?: string,
  branchId?: number | string,
): Promise<RekapTicketRow[]> {
  try {
    const [b2cRows, b2bRows] = await Promise.all([
      getLegacyCustomerRekapTickets(role, userId, workzone, branchId, 'b2c'),
      getLegacyCustomerRekapTickets(role, userId, workzone, branchId, 'b2b'),
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
        branchId,
        'b2c',
      ),
      getFilteredRekapTickets(
        role,
        userId,
        today,
        'kpi_customer',
        workzone,
        branchId,
        'b2b',
      ),
    ]);
    return [...b2cRows, ...b2bRows];
  }
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
  return getOrSetCacheSwr(
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

async function getRekapTeknisiRegistered(
  userId: number,
  workzones: string[] | null,
): Promise<{ sa_name: string; cnt: bigint }[]> {
  const scope =
    workzones && workzones.length > 0
      ? workzones.slice().sort().join(',')
      : 'all';
  const cacheKey = buildRekapTeknisiRegisteredCacheKey(userId, scope);
  return getOrSetCacheSwr(
    cacheKey,
    async () => prisma.$queryRaw<{ sa_name: string; cnt: bigint }[]>`
      SELECT sa.nama_sa AS sa_name, COUNT(DISTINCT u.id_user) AS cnt
      FROM user_sa usa
      JOIN service_area sa ON sa.id_sa = usa.sa_id
      JOIN users u ON u.id_user = usa.user_id
      WHERE u.role_id = 4
      ${workzones && workzones.length > 0 ? Prisma.sql`AND sa.nama_sa IN (${Prisma.join(workzones)})` : Prisma.sql``}
      GROUP BY sa.nama_sa
    `,
    300,
  );
}

async function getRekapAging(
  role: string,
  userId: number,
  bucket: string,
  workzone?: string,
  branchId?: number | string,
): Promise<AgingRow[]> {
  const cacheKey = buildRekapAgingCacheKey(
    role,
    userId,
    bucket,
    workzone,
    branchId,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      try {
        const [whereClause, params] =
          await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
            dept: 'all',
            includeClosed: true,
            workzone,
            branchId,
          });
        const bucketWhere = buildRekapBucketFilterSql(bucket);
        const closeStatusSql = CLOSE_STATUS_VALUES.map(
          (status) => `'${status.replace(/'/g, "''")}'`,
        ).join(', ');
        const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
        const nowTs = wibNow.getTime();
        const threshold = (hours: number) => new Date(nowTs - hours * 3_600_000);

        const sql = `
          SELECT
            sa.nama_sa                         AS saName,
            COUNT(*)                           AS openCount,
            MIN(t.booking_date)                AS oldestAt,
            SUM(CASE WHEN t.booking_date < ? THEN 1 ELSE 0 END) AS g24,
            SUM(CASE WHEN t.booking_date < ? THEN 1 ELSE 0 END) AS g48,
            SUM(CASE WHEN t.booking_date < ? THEN 1 ELSE 0 END) AS g72
          FROM ticket t
          JOIN service_area sa ON sa.nama_sa = t.workzone
          WHERE ${whereClause}
            AND (${bucketWhere})
            AND t.status NOT IN (${closeStatusSql})
          GROUP BY sa.nama_sa
        `;
        const rows = await prisma.$queryRawUnsafe<
          Array<{
            saName: string;
            openCount: bigint;
            oldestAt: Date | null;
            g24: bigint;
            g48: bigint;
            g72: bigint;
          }>
        >(withMaxExecutionTime(sql), ...params, threshold(24), threshold(48), threshold(72));
        return rows.map((r) => ({
          saName: r.saName,
          openCount: Number(r.openCount ?? 0),
          oldestAt: r.oldestAt,
          g24: Number(r.g24 ?? 0),
          g48: Number(r.g48 ?? 0),
          g72: Number(r.g72 ?? 0),
        }));
      } catch (error) {
        logger.warn('Rekap aging query failed', {
          role,
          userId,
          bucket,
          workzone,
          branchId,
          error: String((error as Error)?.message ?? error),
        });
        return [];
      }
    },
    300,
  );
}

async function getRekapExpectedServiceAreas(
  branchId?: number | string,
  workzone?: string,
): Promise<{ area: string; saName: string }[]> {
  if (workzone) {
    return getOrSetCacheSwr(
      `rekap:sa-area:${workzone}`,
      async () =>
        prisma.$queryRaw<{ area: string; saName: string }[]>`
          SELECT a.nama_area AS area, sa.nama_sa AS saName
          FROM service_area sa
          JOIN area a ON a.id_area = sa.area_id
          WHERE sa.nama_sa = ${workzone}
          ORDER BY a.nama_area, sa.nama_sa
        `,
      3600,
    );
  }

  if (branchId) {
    const id = Number(branchId);
    if (!Number.isFinite(id) || id <= 0) return [];
    return getOrSetCacheSwr(
      `rekap:branch-sa-areas:${id}`,
      async () =>
        prisma.$queryRaw<{ area: string; saName: string }[]>`
          SELECT a.nama_area AS area, sa.nama_sa AS saName
          FROM service_area sa
          JOIN area a ON a.id_area = sa.area_id
          WHERE a.branch_id = ${id}
          ORDER BY a.nama_area, sa.nama_sa
        `,
      3600,
    );
  }

  return getOrSetCacheSwr(
    'rekap:all-sa-areas',
    async () =>
      prisma.$queryRaw<{ area: string; saName: string }[]>`
        SELECT a.nama_area AS area, sa.nama_sa AS saName
        FROM service_area sa
        JOIN area a ON a.id_area = sa.area_id
        ORDER BY a.nama_area, sa.nama_sa
      `,
    3600,
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
    onProgress: 0,
    pending: 0,
    close: result.summary.close,
  };
}

async function getTicketManagementBucketSummary(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
  workzone?: string,
  branchId?: number | string,
): Promise<BucketSummaryCounts> {
  const [openResult, closeResult] = await Promise.all([
    DailyTicketService.getDailyTicketTable(role, userId, {
      dept: 'all',
      operationalBucket: [bucket],
      workzone,
      branchId,
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
      branchId,
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
  workzone?: string,
  branchId?: number | string,
): Promise<
  Awaited<ReturnType<typeof DailyTicketService.getKpiBucketSummaryMatrix>>
> {
  return DailyTicketService.getKpiBucketSummaryMatrix(role, userId, {
    dept: 'all',
    includeClosed: true,
    workzone,
    branchId,
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

    const branchParam = request.nextUrl.searchParams.get('branch');
    const branchSas = await resolveBranchScope(
      decoded.role,
      decoded.id_user,
      branchParam,
    );

    if (
      branchParam &&
      branchSas &&
      branchSas.length === 0 &&
      !isSuperAdmin
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
        bucketSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
        },
        workboardSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        selectedBucket: bucket,
      });
    }

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
        bucketSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
        },
        workboardSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        selectedBucket: bucket,
      });
    }

    const scopeWorkzones = selectedWorkzone ? [selectedWorkzone] : workzones;
    const teknisiWorkzones = branchSas
      ? isSuperAdmin
        ? branchSas
        : branchSas.filter((w) => (workzones ?? []).includes(w))
      : scopeWorkzones;

    const expectedSAs = await (async () => {
      if (branchSas && branchSas.length > 0) {
        const all = await getRekapExpectedServiceAreas(branchParam ?? undefined);
        return isSuperAdmin
          ? all
          : all.filter((s) => (workzones ?? []).includes(s.saName));
      }
      if (selectedWorkzone) {
        return getRekapExpectedServiceAreas(undefined, selectedWorkzone);
      }
      const all = await getRekapExpectedServiceAreas();
      return isSuperAdmin ? all : all.filter((s) => (workzones ?? []).includes(s.saName));
    })();

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
        bucketSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
        },
        workboardSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        selectedBucket: bucket,
      });
    }

    const cacheKey = `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (scopeWorkzones ?? []).sort().join(',')}:${bucket}:${branchParam ?? ''}`;

    const data = await getOrSetCacheSwr(
      cacheKey,
      async () => {
        const startedAt = Date.now();
        const [
          ticketRowsAll,
          teknisiRows,
          teknisiRegisteredRows,
          agingRows,
          customerLegacyRows,
          customerSqmOverlayRows,
          customerGamasOverlayRows,
        ] = await Promise.all([
          bucket === 'kpi_customer'
            ? getCustomerRekapTicketsSafe(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              )
            : getFilteredRekapTickets(
                decoded.role,
                decoded.id_user,
                today,
                bucket,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              ),
          getRekapTeknisiRows(today, decoded.id_user, teknisiWorkzones),
          getRekapTeknisiRegistered(decoded.id_user, teknisiWorkzones),
          getRekapAging(
            decoded.role,
            decoded.id_user,
            bucket,
            selectedWorkzone,
            branchParam ? Number(branchParam) : undefined,
          ),
          bucket === 'all' || bucket === 'kpi_customer'
            ? Promise.all([
                getLegacyCustomerBucketRows(
                  decoded.role,
                  decoded.id_user,
                  selectedWorkzone,
                  branchParam ? Number(branchParam) : undefined,
                  'b2c',
                ),
                getLegacyCustomerBucketRows(
                  decoded.role,
                  decoded.id_user,
                  selectedWorkzone,
                  branchParam ? Number(branchParam) : undefined,
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
                branchParam ? Number(branchParam) : undefined,
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
          bucket === 'kpi_customer'
            ? getCustomerGamasOverlayTickets(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              ).catch((error) => {
                logger.warn('Customer gamas overlay failed', {
                  role: decoded.role,
                  userId: decoded.id_user,
                  today,
                  error: String((error as Error)?.message ?? error),
                });
                return [] as RekapTicketRow[];
              })
            : Promise.resolve([] as RekapTicketRow[]),
          ]);
        const fetchedAt = Date.now();
        const bucketBreakdown = buildBucketBreakdownFromRekapRows(ticketRowsAll);
        const workboardSummary = buildBucketSummaryFromRows(ticketRowsAll);
        const kpiSummary = {
          total: workboardSummary.total,
          kpiCustomer: bucketBreakdown.kpiCustomer.total,
          kpiProactive: bucketBreakdown.kpiProactive.total,
          nonKpiUnspec: bucketBreakdown.nonKpiUnspec.total,
          nonTechnical: bucketBreakdown.nonTechnical.total,
          sqmUpdate: bucketBreakdown.sqmUpdate.total,
          obsolete: bucketBreakdown.obsolete.total,
        };

        const ticketRows = filterRekapRowsByBucket(ticketRowsAll, bucket);
        const bucketSummary =
          bucket === 'all'
            ? buildBucketSummaryFromRows(ticketRowsAll)
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
          onProgress: workboardSummary.onProgress,
          pending: workboardSummary.pending,
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
          bucket === 'kpi_customer' ? customerGamasOverlayRows : undefined,
          expectedSAs,
          teknisiRegisteredRows,
        );
      },
      120,
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    if (isQueryOverloadError(error)) {
      logger.warn('rekap-workorder overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    logger.error('Rekap workorder error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
