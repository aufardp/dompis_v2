// Fungsi agregasi murni (tanpa I/O) untuk Rekap Workorder — dipisah dari
// route.ts semata untuk memecah unit kompilasi jadi lebih kecil (route.ts
// tadinya 2100+ baris, terlalu berat dianalisis compiler saat `next build`).
// Tidak ada perubahan logic, murni pemindahan kode.

import type { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import type { KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { getTicketCategory, CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import {
  classifyBucket,
  normalizeB2BJenis,
  normalizeBucketText,
} from '@/lib/rekap/rekap-classify';
import { deptByJenis } from '@/lib/dept';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import type {
  RekapTicketRow,
  LegacyCustomerBucketRow,
  SegCount,
  StatusCounts,
  AgingRow,
  BucketKey,
  BucketRecord,
  DetailGroup,
  SegmentTotal,
  WorkzoneRow,
  SARow,
  KpiSummaryCounts,
  BucketSummaryCounts,
  BucketBreakdownCounts,
  WorkboardSummaryCounts,
  RekapResponse,
} from './types';

export function emptySegmentTotal(): SegmentTotal {
  return {
    b2c: { open: 0, close: 0 },
    b2b: { open: 0, close: 0 },
    netral: { open: 0, close: 0 },
  };
}

export function buildBucketSummaryFromRows(
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

export function buildTicketManagementStyleBucketSummaryFromRows(
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

export function normalizeMergeKeyPart(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function buildMergeKey(
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

export function buildCustomerLegacySummaryFromRows(
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

export function buildCustomerSqmSummaryFromRows(
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

export function buildCustomerGamasSummaryFromRows(
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

export function buildBucketSummaryFromDailySummaries(
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

export function buildBucketBreakdownFromDailySummaries(
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

export function buildBucketBreakdownFromRekapRows(
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

export function buildBucketBreakdownFromOverviewCards(
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

export function buildTicketManagementBucketSummary(
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

export function sumTicketRows(rows: RekapTicketRow[]): number {
  return rows.reduce((total, row) => total + Number(row.cnt ?? 0), 0);
}

export function buildSelectedBucketSummary(
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

export function buildWorkboardSummary(
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

export const BUCKET_VIEW_MEMBERS: Record<KpiBucketKey, BucketKey[]> = {
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

export function filterRekapRowsByBucket(
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

export function emptyBuckets(): BucketRecord {
  return {
    kpiCustomer: { open: 0, close: 0 },
    kpiProactive: { open: 0, close: 0 },
    nonKpiUnspec: { open: 0, close: 0 },
    nonTechnical: { open: 0, close: 0 },
    sqmUpdate: { open: 0, close: 0 },
    obsolete: { open: 0, close: 0 },
  };
}

export function emptyWzBuckets(): BucketRecord {
  return { ...emptyBuckets() };
}

export function emptyDetail(): DetailGroup {
  return { b2c: {}, b2b: {}, netral: {} };
}

export function buildRekapResponse(
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
