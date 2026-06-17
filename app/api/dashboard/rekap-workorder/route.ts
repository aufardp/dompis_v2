import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCache } from '@/lib/cache';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWibDateString } from '@/lib/timezone';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import type { KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { logger } from '@/lib/observability/logger';

interface RekapTicketRow {
  area: string;
  sa_name: string;
  workzone: string | null;
  customer_type: string | null;
  customer_segment: string | null;
  channel: string | null;
  jenis_tiket: string | null;
  guarantee_status: string | null;
  status: string;
  status_update: string;
  jam_expired: string | null;
  jam_expired_gold: string | null;
  jam_expired_diamond: string | null;
  jam_expired_platinum: string | null;
  closed_at: Date | null;
  cnt: bigint;
  source_ticket: string | null;
  classification_flag: string | null;
  classification_path: string | null;
  summary: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
}

interface SegCount { open: number; close: number; }

type BucketKey = 'kpiCustomer' | 'kpiProactive' | 'nonKpiUnspec' | 'nonTechnical' | 'sqmUpdate' | 'obsolete';

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

interface WorkboardSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
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

  const total = sumTicketRows(rows);
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
  summaryMatrix: Awaited<ReturnType<typeof DailyTicketService.getKpiBucketSummaryMatrix>>,
): WorkboardSummaryCounts {
  const all = summaryMatrix.all;
  const total =
    all.kpi_customer.total +
    all.kpi_proactive.total +
    all.non_kpi_unspec.total +
    all.non_technical.total +
    all.sqm_update.total +
    all.obsolete.total;
  const open =
    all.kpi_customer.open +
    all.kpi_proactive.open +
    all.non_kpi_unspec.open +
    all.non_technical.open +
    all.sqm_update.open +
    all.obsolete.open;
  const assigned =
    all.kpi_customer.assigned +
    all.kpi_proactive.assigned +
    all.non_kpi_unspec.assigned +
    all.non_technical.assigned +
    all.sqm_update.assigned +
    all.obsolete.assigned;
  const close =
    all.kpi_customer.close +
    all.kpi_proactive.close +
    all.non_kpi_unspec.close +
    all.non_technical.close +
    all.sqm_update.close +
    all.obsolete.close;

  return { total, open, assigned, close };
}

interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
  kpiSummary: KpiSummaryCounts;
  workboardSummary: WorkboardSummaryCounts;
  selectedBucket: string;
}

function isOpen(status: string): boolean {
  return !CLOSE_STATUS_VALUES.includes(status.trim().toUpperCase());
}

function isClose(status: string): boolean {
  return CLOSE_STATUS_VALUES.includes(status.trim().toUpperCase());
}

const KPI_CUSTOMER_JENIS = new Set([
  'reguler', 'datin', 'non-datin', 'tsel', 'vpn-ip', 'dwdm',
  'astinet', 'metro-e', 'indibiz', 'reseller', 'wifi-id',
]);

function normalizeBucketText(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeBucketCompact(value: string | null | undefined): string {
  return normalizeBucketText(value).replace(/\s+/g, '');
}

function textContainsAny(value: string | null | undefined, terms: readonly string[]): boolean {
  const lower = normalizeBucketText(value);
  const compact = normalizeBucketCompact(value);
  return terms.some((term) => {
    const needle = term.toLowerCase();
    return lower.includes(needle) || compact.includes(needle.replace(/\s+/g, ''));
  });
}

function isTechnicalFlag(value: string | null | undefined): boolean {
  return normalizeBucketText(value) === 'technical';
}

function isNonTechnicalFlag(value: string | null | undefined): boolean {
  const lower = normalizeBucketText(value);
  return lower.includes('nontechnical') || lower.includes('non technical') || lower.includes('billing');
}

function isStatusClosed(status: string | null | undefined): boolean {
  return CLOSE_STATUS_VALUES.includes(normalizeBucketText(status).toUpperCase());
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
  const isSqmJt1 = jt1Raw.includes('sqm') || jt1 === 'sqm' || jt1 === 'sqm-ccan';

  const isNonTech =
    (isCust || isPro) && (
      isNonTechnicalFlag(row.classification_flag) ||
      jt1 === 'unknown' || jt1 === 'permintaan' || jt1 === 'infracare' ||
      jt1 === 'billing' || jt1 === 'digital-spbu' || jt1 === 'non-numbering' ||
      jt2 === 'digital-spbu' ||
      jt1Raw === '' ||
      jt1Raw.includes('unknown')
  );
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
    !textContainsAny(row.jenis_tiket_1, ['unknown', 'permintaan', 'billing', 'infracare', 'digital_spbu', 'digital spbu']) &&
    !textContainsAny(row.jenis_tiket_2, ['unknown', 'digital_spbu', 'digital spbu'])
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
  kpi_customer: [
    'kpiCustomer',
    'kpiProactive',
    'sqmUpdate',
  ],
  kpi_proactive: [
    'kpiProactive',
    'sqmUpdate',
  ],
  non_kpi_unspec: ['nonKpiUnspec'],
  non_technical: ['nonTechnical'],
  sqm_update: ['sqmUpdate'],
  obsolete: ['obsolete'],
};

// Bump this whenever bucket classification or detail aggregation changes.
const REKAP_WORKORDER_CACHE_VERSION = 'v6';

function filterRekapRowsByBucket(
  rows: RekapTicketRow[],
  bucket: KpiBucketKey,
): RekapTicketRow[] {
  const members = BUCKET_VIEW_MEMBERS[bucket] ?? BUCKET_VIEW_MEMBERS.all;
  if (bucket === 'all') return rows;

  if (bucket === 'kpi_customer') {
    return rows.filter((row) => {
      const source = normalizeBucketText(row.source_ticket);
      if (source === 'customer' && classifyBucket(row) !== 'obsolete') return true;
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
): RekapResponse {
  const teknisiMap = new Map(teknisiRows.map((r) => [r.sa_name, Number(r.cnt)]));

  const useJenis2 = bucket === 'kpi_proactive' || bucket === 'sqm_update';
  const useUnspec = bucket === 'non_kpi_unspec';

  const saMap = new Map<string, {
    area: string;
    buckets: BucketRecord;
    detail: DetailGroup;
    sqm: { open: number; close: number; update: number };
    workzones: Map<string, WorkzoneRow>;
    jenisTiket: Record<string, SegCount>;
  }>();

  for (const row of ticketRows) {
    const key = row.sa_name;
    if (!saMap.has(key)) {
      saMap.set(key, {
        area: row.area,
        buckets: emptyBuckets(),
        detail: emptyDetail(),
        sqm: { open: 0, close: 0, update: 0 },
        workzones: new Map(),
        jenisTiket: {},
      });
    }

    const sa = saMap.get(key)!;
    const ticketBucket = classifyBucket(row);
    const cnt = Number(row.cnt);
    const open = isOpen(row.status) ? cnt : 0;
    const close = isClose(row.status) ? cnt : 0;

    const jtKey = (row.jenis_tiket ?? 'UNKNOWN').toUpperCase();
    if (!sa.jenisTiket[jtKey]) sa.jenisTiket[jtKey] = { open: 0, close: 0 };
    sa.jenisTiket[jtKey].open += open;
    sa.jenisTiket[jtKey].close += close;

    sa.buckets[ticketBucket].open += open;
    sa.buckets[ticketBucket].close += close;

    const seg = (row.customer_segment ?? '').toUpperCase();
    const segKey = seg === 'DCS' || seg === 'PL-TSEL' ? 'b2c' : 'b2b';
    const detailJenisSource = row.jenis_tiket_1 ?? row.jenis_tiket_2 ?? row.jenis_tiket;

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

    const wzCode = row.workzone ?? 'UNKNOWN';
    if (!sa.workzones.has(wzCode)) {
      sa.workzones.set(wzCode, {
        workzone: wzCode,
        buckets: emptyWzBuckets(),
        detail: emptyDetail(),
        sqm: { open: 0, close: 0, update: 0 },
        totalOpen: 0, totalClose: 0,
      });
    }
    const wz = sa.workzones.get(wzCode)!;
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

  const rows: SARow[] = [];
  let no = 1;
  for (const [saName, data] of saMap) {
    const teknisiMasuk = teknisiMap.get(saName) ?? 0;
    const totalOpen = Object.values(data.buckets).reduce((s, v) => s + v.open, 0);
    const totalClose = Object.values(data.buckets).reduce((s, v) => s + v.close, 0);
    const workzoneRows = Array.from(data.workzones.values())
      .sort((a, b) => a.workzone.localeCompare(b.workzone));

    for (const wz of workzoneRows) {
      wz.sqm = {
        open: wz.buckets.kpiProactive.open + wz.buckets.sqmUpdate.open,
        close: wz.buckets.kpiProactive.close + wz.buckets.sqmUpdate.close,
        update: wz.buckets.sqmUpdate.open,
      };
    }

    data.sqm = {
      open: data.buckets.kpiProactive.open + data.buckets.sqmUpdate.open,
      close: data.buckets.kpiProactive.close + data.buckets.sqmUpdate.close,
      update: data.buckets.sqmUpdate.open,
    };

    rows.push({
      no: no++, area: data.area, saName, teknisiMasuk,
      woPerTeknisi: teknisiMasuk > 0 ? (totalOpen / teknisiMasuk).toFixed(1) : '—',
      buckets: data.buckets, detail: data.detail, sqm: data.sqm,
      workzones: workzoneRows,
      totalOpen, totalClose,
      grandTotal: totalOpen + totalClose,
      jenisTiket: data.jenisTiket,
    });
  }

  rows.sort((a, b) => a.area.localeCompare(b.area) || a.saName.localeCompare(b.saName));

  return {
    title: 'REKAP WORKORDER ASSURANCE',
    subtitle: '[REGULER - HVC - SQM]',
    timestamp: new Date().toISOString(),
    syncDate,
    rows,
    totals: {},
    kpiSummary,
    workboardSummary,
    selectedBucket: bucket,
  };
}

function buildRekapTicketsCacheKey(
  role: string,
  userId: number,
  syncDate: string,
): string {
  return `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:raw:${syncDate}:${role}:${userId}:all`;
}

async function getFilteredRekapTickets(
  role: string,
  userId: number,
  syncDate: string,
): Promise<RekapTicketRow[]> {
  const cacheKey = buildRekapTicketsCacheKey(role, userId, syncDate);
  return getOrSetCache(cacheKey, async () => {
    const [whereClause, params] = await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept: 'all',
    });
    const fullSql = `
    SELECT
      a.nama_area                     AS area,
      sa.nama_sa                      AS sa_name,
      t.workzone,
      t.customer_type,
      t.customer_segment,
      t.channel,
      COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
      t.guarantee_status              AS guarante_status,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      t.jam_expired,
      t.status_ttr_12_gold            AS jam_expired_gold,
      t.status_ttr_3_diamond          AS jam_expired_diamond,
      t.status_ttr_6_platinum         AS jam_expired_platinum,
      t.closed_at,
      t.source_ticket,
      t.classification_flag,
      t.classification_path,
      t.summary,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    LEFT JOIN branch b   ON b.id_branch = a.branch_id
    WHERE ${whereClause}
    GROUP BY a.nama_area, sa.nama_sa, t.workzone, t.customer_type, t.customer_segment,
             t.channel,
             COALESCE(t.jenis_tiket_2, t.jenis_tiket_1),
             t.guarantee_status, t.status, LOWER(COALESCE(t.status_update, 'open')),
             t.jam_expired, t.status_ttr_12_gold,
             t.status_ttr_3_diamond, t.status_ttr_6_platinum, t.closed_at,
             t.source_ticket, t.classification_flag, t.classification_path,
             t.summary, t.jenis_tiket_1, t.jenis_tiket_2
    ORDER BY a.nama_area, sa.nama_sa, t.workzone
  `;
    return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
  }, 60);
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const workzones = isSuperAdmin ? null : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;
    const requestedBucket = request.nextUrl.searchParams.get('bucket') ?? 'all';
    const bucket: KpiBucketKey = (
      requestedBucket === 'kpi_customer' ||
      requestedBucket === 'kpi_proactive' ||
      requestedBucket === 'non_kpi_unspec' ||
      requestedBucket === 'non_technical' ||
      requestedBucket === 'sqm_update' ||
      requestedBucket === 'obsolete'
    ) ? requestedBucket : 'all';

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({
        rows: [], totals: {}, timestamp: new Date().toISOString(), syncDate: today,
        title: 'REKAP WORKORDER ASSURANCE', subtitle: '[REGULER - HVC - SQM]',
        kpiSummary: { total: 0, kpiCustomer: 0, kpiProactive: 0, nonKpiUnspec: 0, nonTechnical: 0, sqmUpdate: 0, obsolete: 0 },
        workboardSummary: { total: 0, open: 0, assigned: 0, close: 0 },
        selectedBucket: bucket,
      });
    }

    const cacheKey = `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (workzones ?? []).sort().join(',')}:${bucket}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const summaryMatrix = await DailyTicketService.getKpiBucketSummaryMatrix(
        decoded.role,
        decoded.id_user,
      );

      const all = summaryMatrix.all;
      const workboardSummary = buildWorkboardSummary(summaryMatrix);

      const kpiCustomerTotal = all.kpi_customer.total;
      const kpiProactiveTotal = all.kpi_proactive.total;
      const nonKpiUnspecTotal = all.non_kpi_unspec.total;
      const nonTechnicalTotal = all.non_technical.total;
      const sqmUpdateTotal = all.sqm_update.total;
      const obsoleteTotal = all.obsolete.total;

      const kpiSummary = {
        total: kpiCustomerTotal + kpiProactiveTotal + nonKpiUnspecTotal + nonTechnicalTotal + sqmUpdateTotal + obsoleteTotal,
        kpiCustomer: kpiCustomerTotal,
        kpiProactive: kpiProactiveTotal,
        nonKpiUnspec: nonKpiUnspecTotal,
        nonTechnical: nonTechnicalTotal,
        sqmUpdate: sqmUpdateTotal,
        obsolete: obsoleteTotal,
      };

    const [ticketRowsAll, teknisiRows] = await Promise.all([
        getFilteredRekapTickets(decoded.role, decoded.id_user, today),
        prisma.$queryRaw<{ sa_name: string; cnt: bigint }[]>`          SELECT sa.nama_sa AS sa_name, COUNT(DISTINCT a.technician_id) AS cnt
          FROM technician_attendance a
          JOIN service_area sa ON sa.id_sa = a.workzone_id
          JOIN users u ON u.id_user = a.technician_id
          JOIN roles ro ON ro.id_role = u.role_id
          WHERE a.date = ${today}
            AND ro.key = 'teknisi'
          ${workzones && workzones.length > 0 ? Prisma.sql`AND sa.nama_sa IN (${Prisma.join(workzones)})` : Prisma.sql``}
          GROUP BY sa.nama_sa
        `,
      ]);

      const ticketRows = filterRekapRowsByBucket(ticketRowsAll, bucket);

      const selectedBucketSummary = buildSelectedBucketSummary(
        bucket,
        ticketRows,
        kpiSummary,
      );

      return buildRekapResponse(
        ticketRows,
        teknisiRows,
        today,
        selectedBucketSummary,
        bucket,
        workboardSummary,
      );
    }, 120);

    return NextResponse.json(data);
  } catch (error: unknown) {
    logger.error('Rekap workorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
