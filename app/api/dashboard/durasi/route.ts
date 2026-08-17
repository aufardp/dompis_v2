import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getWorkzonesForUser, resolveBranchScope } from '@/app/helpers/ticket.helpers';
import { nowWib, toWibDateString } from '@/lib/timezone';
import type { KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { logger } from '@/lib/observability/logger';
import { getErrorMessage } from '@/app/libs/apiError';
import {
  bucketHSI,
  bucketManja,
  bucketStandard,
  calculateDurationHours,
  matchesDurasiPanel,
  STANDARD_BUCKETS as DURASI_STANDARD_BUCKETS,
  MANJA_BUCKETS as DURASI_MANJA_BUCKETS,
  HSI_BUCKETS as DURASI_HSI_BUCKETS,
} from './durasi-logic';

const STANDARD_BUCKETS = DURASI_STANDARD_BUCKETS;
const MANJA_BUCKETS = DURASI_MANJA_BUCKETS;
const HSI_BUCKETS = DURASI_HSI_BUCKETS;

interface RawDurasiRow {
  region: string | null;
  area: string | null;
  sa_name: string | null;
  reported_date: string | null;
  status: string | null;
  customer_type: string | null;
  jenis_tiket: string | null;
  flagging_manja: string | null;
  manja_expired: string | null;
  summary: string | null;
}

interface WorkzoneSeed {
  area: string;
  region: string;
  sa: string;
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
  open: number;
  assigned: number;
  unassigned: number;
  close: number;
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

function summarizeOverviewBucket(
  overview: Awaited<ReturnType<typeof DailyTicketService.getTicketManagementOverviewSummary>>,
  bucket: KpiBucketKey,
): KpiSummaryCounts {
  const cards = overview.cards;

  if (bucket === 'all') {
    const selectedCards = Object.values(cards);
    return selectedCards.reduce<KpiSummaryCounts>(
      (acc, card) => ({
        total: acc.total + card.total,
        open: acc.open + card.open,
        assigned: acc.assigned + card.assigned,
        unassigned: acc.unassigned + card.open,
        close: acc.close + card.close,
        kpiCustomer: acc.kpiCustomer + (card === cards.kpiCustomer ? card.total : 0),
        kpiProactive: acc.kpiProactive + (card === cards.kpiProactive ? card.total : 0),
        nonKpiUnspec: acc.nonKpiUnspec + (card === cards.nonKpiUnspec ? card.total : 0),
        nonTechnical: acc.nonTechnical + (card === cards.nonTechnical ? card.total : 0),
        sqmUpdate: acc.sqmUpdate + (card === cards.sqmUpdate ? card.total : 0),
        obsolete: acc.obsolete + (card === cards.obsolete ? card.total : 0),
      }),
      {
        total: 0,
        open: 0,
        assigned: 0,
        unassigned: 0,
        close: 0,
        kpiCustomer: 0,
        kpiProactive: 0,
        nonKpiUnspec: 0,
        nonTechnical: 0,
        sqmUpdate: 0,
        obsolete: 0,
      },
    );
  }

  const selected =
    bucket === 'kpi_customer'
      ? cards.kpiCustomer
      : bucket === 'kpi_proactive'
        ? cards.kpiProactive
        : bucket === 'non_kpi_unspec'
          ? cards.nonKpiUnspec
          : bucket === 'non_technical'
            ? cards.nonTechnical
            : bucket === 'sqm_update'
              ? cards.sqmUpdate
              : cards.obsolete;

  return {
    total: selected.total,
    open: selected.open,
    assigned: selected.assigned,
    unassigned: selected.open,
    close: selected.close,
    kpiCustomer: cards.kpiCustomer.total,
    kpiProactive: cards.kpiProactive.total,
    nonKpiUnspec: cards.nonKpiUnspec.total,
    nonTechnical: cards.nonTechnical.total,
    sqmUpdate: cards.sqmUpdate.total,
    obsolete: cards.obsolete.total,
  };
}

const PANEL_CONFIGS = [
  { type: 'REGULER', label: 'REGULER', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'REGULER'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateDurationHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HVC_DIAMOND_PLATINUM', label: 'HVC DIAMOND & PLATINUM', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'HVC_DIAMOND_PLATINUM'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateDurationHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HVC_GOLD', label: 'HVC GOLD', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'HVC_GOLD'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateDurationHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'MANJA', label: 'MANJA', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'MANJA'), bucketFn: bucketManja, buckets: MANJA_BUCKETS },
  { type: 'FFG', label: 'FFG', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'FFG'), bucketFn: bucketManja, buckets: MANJA_BUCKETS },
  { type: 'SQM_UPDATE', label: 'SQM UPDATE', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'SQM_UPDATE'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateDurationHours(t.reported_date)), buckets: STANDARD_BUCKETS, showTotal: true },
  { type: 'SQM', label: 'SQM', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'SQM'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateDurationHours(t.reported_date)), buckets: STANDARD_BUCKETS, showTotal: true },
  { type: 'ANAK_GAMAS', label: 'ANAK GAMAS', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'ANAK_GAMAS'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateDurationHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HSI', label: 'HSI', filter: (t: RawDurasiRow) => matchesDurasiPanel(t, 'HSI'), bucketFn: (t: RawDurasiRow) => bucketHSI(calculateDurationHours(t.reported_date)), buckets: HSI_BUCKETS },
];

function buildDurasiTicketsCacheKey(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
  syncDate: string,
  branchParam?: string | null,
): string {
  return `dashboard:durasi:raw:${syncDate}:${role}:${userId}:${bucket}:${branchParam ?? ''}`;
}

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
    buckets: [...config.buckets],
    areaMap: new Map(),
    totals: new Array(config.buckets.length).fill(0),
    grandTotal: 0,
    showTotal: config.showTotal ?? false,
  };
}

function prefillAccumulator(acc: PanelAccumulator, workzones: WorkzoneSeed[]) {
  for (const wz of workzones) {
    if (!acc.areaMap.has(wz.area)) {
      acc.areaMap.set(wz.area, { region: wz.region, saMap: new Map() });
    }
    const areaData = acc.areaMap.get(wz.area)!;
    if (!areaData.saMap.has(wz.sa)) {
      areaData.saMap.set(wz.sa, new Array(acc.buckets.length).fill(0));
    }
  }
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

async function getVisibleWorkzones(
  role: string,
  userId: number,
  isSuperAdmin: boolean,
  userWorkzones: string[] | null,
  branchSas?: string[] | null,
): Promise<WorkzoneSeed[]> {
  const rows = await prisma.service_area.findMany({
    where: isSuperAdmin
      ? branchSas
        ? { nama_sa: { in: branchSas } }
        : undefined
      : {
          nama_sa: {
            in:
              branchSas
                ? (userWorkzones ?? []).filter((w) => branchSas.includes(w))
                : userWorkzones ?? [],
          },
        },
    take: 500,
    select: {
      nama_sa: true,
      area: {
        select: {
          nama_area: true,
          branch: {
            select: {
              region: { select: { nama_region: true } },
            },
          },
        },
      },
    },
  });

  return rows
    .map((row) => ({
      area: row.area?.nama_area ?? 'UNKNOWN',
      region: row.area?.branch?.region?.nama_region ?? 'UNKNOWN',
      sa: row.nama_sa ?? 'UNKNOWN',
    }))
    .sort((a, b) =>
      a.area.localeCompare(b.area) ||
      a.sa.localeCompare(b.sa),
    );
}

function buildAllPanels(
  tickets: RawDurasiRow[],
  syncDate: string,
  workzones: WorkzoneSeed[],
): Omit<DashboardDurasiResponse, 'kpiSummary' | 'selectedBucket'> {
  const accumulators = PANEL_CONFIGS.map(createAccumulator);
  for (const acc of accumulators) {
    prefillAccumulator(acc, workzones);
  }

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
  syncDate: string,
  branchParam?: string | null,
): Promise<RawDurasiRow[]> {
  const cacheKey = buildDurasiTicketsCacheKey(role, userId, bucket, syncDate, branchParam);
  return getOrSetCache(cacheKey, async () => {
    const filtersList = BUCKET_FILTERS[bucket];
    const parts: string[] = [];
    const allParams: any[] = [];

    for (const filters of filtersList) {
      const [whereClause, params] = await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
        ...filters,
        includeClosed: true,
        branchId: branchParam ? Number(branchParam) : undefined,
      });
      parts.push(`(SELECT id_ticket FROM ticket WHERE ${whereClause} LIMIT 5000)`);
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
      t.status,
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
  }, 60);
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'durasi',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const workzones = isSuperAdmin ? null : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;
    const requestedBucket = request.nextUrl.searchParams.get('bucket') ?? 'all';
    const bucket: KpiBucketKey = requestedBucket in BUCKET_FILTERS
      ? (requestedBucket as KpiBucketKey)
      : 'all';
    const branchParam = request.nextUrl.searchParams.get('branch');
    const branchSas = await resolveBranchScope(
      decoded.role,
      decoded.id_user,
      branchParam,
    );

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({
        error: 'Tidak ada Service Area yang dikonfigurasi untuk akun ini',
        panels: [], syncDate: today, generatedAt: new Date().toISOString(),
        kpiSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          unassigned: 0,
          close: 0,
          kpiCustomer: 0,
          kpiProactive: 0,
          nonKpiUnspec: 0,
          nonTechnical: 0,
          sqmUpdate: 0,
          obsolete: 0,
        },
        selectedBucket: bucket,
      });
    }

    const cacheKey = `dashboard:durasi:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (workzones ?? []).sort().join(',')}:${bucket}:${branchParam ?? ''}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const overview = await DailyTicketService.getTicketManagementOverviewSummary(
        decoded.role,
        decoded.id_user,
        undefined,
        branchParam ? Number(branchParam) : undefined,
      );
      const kpiSummary = summarizeOverviewBucket(overview, bucket);
      const tickets = await getFilteredTickets(
        decoded.role,
        decoded.id_user,
        bucket,
        today,
        branchParam,
      );

      const visibleWorkzones = await getVisibleWorkzones(
        decoded.role,
        decoded.id_user,
        isSuperAdmin,
        workzones,
        branchSas,
      );

      return {
        ...buildAllPanels(tickets, today, visibleWorkzones),
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
      return NextResponse.json({ error: getErrorMessage(error, 'Unauthorized') }, { status: error.status });
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Internal server error') }, { status: 500 });
  }
}
