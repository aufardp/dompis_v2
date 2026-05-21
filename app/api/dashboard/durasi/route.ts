import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCache } from '@/lib/cache';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWibDateString } from '@/lib/timezone';

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

interface DashboardDurasiResponse {
  syncDate: string;
  generatedAt: string;
  panels: PanelData[];
}

function toWIB(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

function calculateHours(reportedDate: string | null): number | null {
  if (!reportedDate) return null;
  const reported = new Date(reportedDate);
  if (isNaN(reported.getTime())) return null;
  return (Date.now() - reported.getTime()) / 3_600_000;
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
  const days = (Date.now() - new Date(row.reported_date).getTime()) / 86_400_000;
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
  { type: 'SQM', label: 'SQM', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('sqm'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS, showTotal: true },
  { type: 'ANAK_GAMAS', label: 'ANAK GAMAS', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('anak_gamas'), bucketFn: (t: RawDurasiRow) => bucketStandard(calculateHours(t.reported_date)), buckets: STANDARD_BUCKETS },
  { type: 'HSI', label: 'HSI', filter: (t: RawDurasiRow) => t.jenis_tiket?.toLowerCase().includes('hsi'), bucketFn: (t: RawDurasiRow) => bucketHSI(calculateHours(t.reported_date)), buckets: HSI_BUCKETS },
];

function buildPanel(type: string, label: string, tickets: RawDurasiRow[], buckets: string[], bucketFn: (t: RawDurasiRow) => number, showTotal: boolean = false): PanelData {
  const areaMap = new Map<string, { region: string; saMap: Map<string, number[]> }>();
  const totals = new Array(buckets.length).fill(0);
  let grandTotal = 0;

  for (const t of tickets) {
    const area = t.area ?? 'UNKNOWN';
    const region = t.region ?? 'UNKNOWN';
    const sa = t.sa_name ?? 'UNKNOWN';
    const bucket = bucketFn(t);
    if (bucket < 0 || bucket >= buckets.length) continue;

    if (!areaMap.has(area)) areaMap.set(area, { region, saMap: new Map() });
    const areaData = areaMap.get(area)!;
    if (!areaData.saMap.has(sa)) areaData.saMap.set(sa, new Array(buckets.length).fill(0));
    const saCounts = areaData.saMap.get(sa)!;
    saCounts[bucket]++;
    totals[bucket]++;
    grandTotal++;
  }

  const areas: PanelArea[] = [];
  for (const [areaName, data] of areaMap) {
    const sas = Array.from(data.saMap.entries()).map(([name, counts]) => ({ name, counts })).sort((a, b) => a.name.localeCompare(b.name));
    areas.push({ name: areaName, region: data.region, sas });
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));

  return { type, label, buckets, areas, totals, ...(showTotal ? { grandTotal } : {}) };
}

function buildAllPanels(
  tickets: RawDurasiRow[],
  syncDate: string,
): DashboardDurasiResponse {
  const panels = PANEL_CONFIGS.map((cfg) => {
    const filtered = tickets.filter(cfg.filter);
    return buildPanel(cfg.type, cfg.label, filtered, cfg.buckets, cfg.bucketFn, cfg.showTotal ?? false);
  });
  return { syncDate, generatedAt: new Date().toISOString(), panels };
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const workzones = isSuperAdmin ? null : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({
        error: 'Tidak ada Service Area yang dikonfigurasi untuk akun ini',
        panels: [], syncDate: today, generatedAt: new Date().toISOString(),
      });
    }

    const cacheKey = `dashboard:durasi:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (workzones ?? []).sort().join(',')}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const whereWorkzone = workzones && workzones.length > 0
        ? Prisma.sql`AND t.workzone IN (${Prisma.join(workzones)})`
        : Prisma.sql``;

      const tickets = await prisma.$queryRaw<RawDurasiRow[]>`
        SELECT
          COALESCE(r.nama_region, 'UNKNOWN') AS region,
          COALESCE(a.nama_area, 'UNKNOWN')   AS area,
          COALESCE(sa.nama_sa, 'UNKNOWN')    AS sa_name,
          t.reported_date,
          t.customer_type,
          CONCAT_WS(' ', t.jenis_tiket_1, t.jenis_tiket_2) AS jenis_tiket,
          t.flagging_manja,
          t.manja_expired
        FROM ticket t
        JOIN service_area sa ON sa.nama_sa = t.workzone
        JOIN area a          ON a.id_area = sa.area_id
        LEFT JOIN branch b   ON b.id_branch = a.branch_id
        LEFT JOIN region r   ON r.id_region = b.region_id
        WHERE t.sync_date = ${today}
          ${whereWorkzone}
        ORDER BY a.nama_area, sa.nama_sa
      `;

      return buildAllPanels(tickets, today);
    }, 60);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' },
    });
  } catch (error: any) {
    console.error('Dashboard durasi error:', error);
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
