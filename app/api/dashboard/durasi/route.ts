import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache } from '@/lib/cache';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { nowWib, toWibDateString } from '@/lib/timezone';
import type { KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { logger } from '@/lib/observability/logger';

const STANDARD_BUCKETS = ['0-3J', '3-6J', '6-12J', '12-24J', '24-36J', '>36J'];
const MANJA_BUCKETS = ['0-1d', '1-2d', '2-3d', 'EXPIRED'];
const HSI_BUCKETS = ['<1h', '<3h', '<4h', '<12h', '<24h', 'EXPIRED'];

interface RawDurasiRow {
  region: string | null;
  area: string | null;
  sa_name: string | null;
  reported_date: string | null;
  customer_type: string | null;
  jenis_tiket: string | null;
  flagging_manja: string | null;
  manja_expired: string | null;
  summary: string | null;
}

interface PanelArea {
  name: string;
  region: string;
  sas: Array<{ name: string; counts: number[] }>;
}

interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: PanelArea[];
  totals: number[];
  grandTotal?: number;
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

interface DashboardDurasiResponse {
  syncDate: string;
  generatedAt: string;
  panels: PanelData[];
  kpiSummary: KpiSummaryCounts;
  selectedBucket: string;
}

function calculateHours(reportedDate: string | null): number | null {
  if (!reportedDate) return null;
  const reported = new Date(reportedDate);
  if (isNaN(reported.getTime())) return null;
  return (nowWib().getTime() - reported.getTime()) / 3_600_000;
}

function bucketStandard(hours: number | null): number {
  if (hours === null) return 5;
  if (hours <= 3) return 0;
  if (hours <= 6) return 1;
  if (hours <= 12) return 2;
  if (hours <= 24) return 3;
  if (hours <= 36) return 4;
  return 5;
}

function bucketManja(row: { flagging_manja: string | null; reported_date: string | null }): number {
  if (row.flagging_manja === 'EXPIRED') return 3;
  if (!row.reported_date) return 3;
  const days = (nowWib().getTime() - new Date(row.reported_date).getTime()) / 86_400_000;
  if (days <= 1) return 0;
  if (days <= 2) return 1;
  if (days <= 3) return 2;
  return 3;
}

function bucketHSI(hours: number | null): number {
  if (hours === null) return 5;
  if (hours < 1) return 0;
  if (hours < 3) return 1;
  if (hours < 4) return 2;
  if (hours < 12) return 3;
  if (hours < 24) return 4;
  return 5;
}

const PANEL_CONFIGS = [
  { type: 'REGULER', label: 'REGULER', filter: (t: RawDurasiRow) => t.customer_type === 'REGULER', bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HVC_DIAMOND_PLATINUM', label: 'HVC DIAMOND & PLATINUM', filter: (t: RawDurasiRow) => ['HVC_DIAMOND', 'HVC_PLATINUM'].includes(t.customer_type ?? ''), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HVC_GOLD', label: 'HVC GOLD', filter: (t: RawDurasiRow) => t.customer_type === 'HVC_GOLD', bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'MANJA', label: 'MANJA', filter: (t: RawDurasiRow) => !!t.flagging_manja || t.jenis_tiket?.toLowerCase().includes('manja'), bucketFn: bucketManja, buckets: MANJA_BUCKETS },
  { type: 'FFG', label: 'FFG', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('ffg'), bucketFn: bucketManja, buckets: MANJA_BUCKETS },
  { type: 'SQM_UPDATE', label: 'SQM UPDATE', filter: (t: RawDurasiRow) => (t.summary ?? '').startsWith('[SQM-UPDATE]'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS, showTotal: true },
  { type: 'SQM', label: 'SQM', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('sqm'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS, showTotal: true },
  { type: 'ANAK_GAMAS', label: 'ANAK GAMAS', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('anak_gamas'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HSI', label: 'HSI', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('hsi'), bucketFn: (t: RawDurasiRow) => bucketHSI(calculateHours(t.reported_date)), buckets: HSI_BUCKETS },
];

type PanelAccumulator = {
  type: string;
  label: string;
  buckets: string[];
  areaMap: Map<string, { region: string; saMap: Map<string, number[]> }>;
  totals: number[];
  grandTotal: number;
  showTotal: boolean;
};

function createAccumulator(config: (typeof PANEL_CONFIGS)[number]): PanelAccumulator {
  return {
    type: config.type,
    label: config.label,
    buckets: config.buckets,
    areaMap: new Map(),
    totals: new Array(config.buckets.length).fill(0),
    grandTotal: 0,
    showTotal: config.showTotal ?? false,
  };
}

function addToAccumulator(
  acc: PanelAccumulator,
  row: RawDurasiRow,
  bucket: number,
) {
  if (bucket < 0 || bucket >= acc.buckets.length) return;

  const area = row.area ?? 'UNKNOWN';
  const region = row.region ?? 'UNKNOWN';
  const sa = row.sa_name ?? 'UNKNOWN';

  if (!acc.areaMap.has(area)) {
    acc.areaMap.set(area, { region, saMap: new Map() });
  }
  const areaData = acc.areaMap.get(area)!;
  if (!areaData.saMap.has(sa)) {
    areaData.saMap.set(sa, new Array(acc.buckets.length).fill(0));
  }
  const saCounts = areaData.saMap.get(sa)!;
  saCounts[bucket] += 1;
  acc.totals[bucket] += 1;
  acc.grandTotal += 1;
}

function finalizePanel(acc: PanelAccumulator): PanelData {
  const areas: PanelArea[] = [];
  for (const [areaName, data] of acc.areaMap) {
    const sas = Array.from(data.saMap.entries()).map(([name, counts]) => ({ name, counts })).sort((a, b) => a.name.localeCompare(b.name));
    areas.push({ name: areaName, region: data.region, sas });
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));

  return {
    type: acc.type,
    label: acc.label,
    buckets: acc.buckets,
    areas,
    totals: acc.totals,
    ...(acc.showTotal ? { grandTotal: acc.grandTotal } : {}),
  };
}

function buildAllPanels(
  tickets: RawDurasiRow[],
  syncDate: string,
): Omit<DashboardDurasiResponse, 'kpiSummary' | 'selectedBucket'> {
  const accumulators = PANEL_CONFIGS.map(createAccumulator);

  for (const ticket of tickets) {
    for (let i = 0; i < PANEL_CONFIGS.length; i++) {
      const config = PANEL_CONFIGS[i];
      if (!config.filter(ticket)) continue;
      addToAccumulator(accumulators[i], ticket, config.bucketFn(ticket));
    }
  }

  const panels = accumulators.map(finalizePanel);
  return { syncDate, generatedAt: new Date().toISOString(), panels };
}

const BUCKET_FILTERS: Record<KpiBucketKey, any[]> = {
  kpi_customer: [
    { dept: 'all', operationalBucket: ['kpi_customer'] },
    { dept: 'all', regulerOnly: true },
  ],
  kpi_proactive: [
    { dept: 'all', operationalBucket: ['kpi_proactive'] },
  ],
  non_kpi_unspec: [
    { dept: 'all', operationalBucket: ['non_kpi_unspec'] },
  ],
  non_technical: [
    { dept: 'all', operationalBucket: ['non_technical'] },
  ],
  sqm_update: [
    { dept: 'all', operationalBucket: ['sqm_update'] },
  ],
  obsolete: [
    { dept: 'all', operationalBucket: ['obsolete'] },
  ],
  all: [
    { dept: 'all', operationalBucket: ['kpi_customer'] },
    { dept: 'all', operationalBucket: ['kpi_proactive'] },
    { dept: 'all', operationalBucket: ['non_kpi_unspec'] },
    { dept: 'all', operationalBucket: ['non_technical'] },
    { dept: 'all', operationalBucket: ['sqm_update'] },
    { dept: 'all', operationalBucket: ['obsolete'] },
  ],
};

async function getFilteredTickets(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
): Promise<RawDurasiRow[]> {
  const filtersList = BUCKET_FILTERS[bucket];
  const parts: string[] = [];
  const allParams: any[] = [];

  for (const filters of filtersList) {
    const [whereClause, params] = await DailyTicketService.buildDailyTicketSqlParams(role, userId, filters);
    parts.push(`(SELECT id_ticket FROM ticket WHERE ${whereClause})`);
    allParams.push(...params);
  }

  if (parts.length === 0) return [];

  const unionSql = parts.join(' UNION ALL ');
  const fullSql = `
    SELECT
      COALESCE(r.nama_region, 'UNKNOWN') AS region,
      COALESCE(a.nama_area, 'UNKNOWN')   AS area,
      COALESCE(sa.nama_sa, 'UNKNOWN')    AS sa_name,
      t.reported_date,
      t.customer_type,
      CONCAT_WS(' ', t.jenis_tiket_1, t.jenis_tiket_2) AS jenis_tiket,
      t.flagging_manja,
      t.manja_expired,
      t.summary
    FROM (${unionSql}) AS ids
    JOIN ticket t ON t.id_ticket = ids.id_ticket
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    LEFT JOIN branch b   ON b.id_branch = a.branch_id
    LEFT JOIN region r   ON r.id_region = b.region_id
    ORDER BY a.nama_area, sa.nama_sa
  `;

  return prisma.$queryRawUnsafe<RawDurasiRow[]>(fullSql, ...allParams);
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const workzones = isSuperAdmin ? null : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;
    const requestedBucket = request.nextUrl.searchParams.get('bucket') ?? 'all';
    const bucket: KpiBucketKey = requestedBucket in BUCKET_FILTERS
      ? (requestedBucket as KpiBucketKey)
      : 'all';

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({
        error: 'Tidak ada Service Area yang dikonfigurasi untuk akun ini',
        panels: [], syncDate: today, generatedAt: new Date().toISOString(),
        kpiSummary: { total: 0, kpiCustomer: 0, kpiProactive: 0, nonKpiUnspec: 0, nonTechnical: 0, sqmUpdate: 0, obsolete: 0 },
        selectedBucket: bucket,
      });
    }

    const cacheKey = `dashboard:durasi:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (workzones ?? []).sort().join(',')}:${bucket}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const summaryMatrix = await DailyTicketService.getKpiBucketSummaryMatrix(
        decoded.role,
        decoded.id_user,
      );

      const all = summaryMatrix.all;

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

      const tickets = await getFilteredTickets(decoded.role, decoded.id_user, bucket);

      return {
        ...buildAllPanels(tickets, today),
        kpiSummary,
        selectedBucket: bucket,
      };
    }, 60);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    });
  } catch (error: any) {
    logger.error('Dashboard durasi error:', error);
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
