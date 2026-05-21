import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCache } from '@/lib/cache';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWibDateString } from '@/lib/timezone';
import { isB2CJenis, isB2BJenis, normalizeJenis } from '@/app/config/jenis-tiket';

function toWIB(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

interface RekapTicketRow {
  area: string;
  sa_name: string;
  workzone: string | null;
  customer_type: string | null;
  jenis_tiket: string | null;
  guarante_status: string | null;
  status_update: string;
  jam_expired: string | null;
  jam_expired_gold: string | null;
  jam_expired_diamond: string | null;
  jam_expired_platinum: string | null;
  closed_at: Date | null;
  cnt: bigint;
}

interface SegCount { open: number; close: number; }

interface WorkzoneRow {
  workzone: string;
  b2c: { diamond: SegCount; platinum: SegCount; goldReg: SegCount; sqmB2c: SegCount; };
  b2b: { datin: SegCount; nonDatin: SegCount; sqmB2b: SegCount; tsel: SegCount; };
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  b2c: { diamond: SegCount; platinum: SegCount; goldReg: SegCount; sqmB2c: SegCount; };
  b2b: { datin: SegCount; nonDatin: SegCount; sqmB2b: SegCount; tsel: SegCount; };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
}

function isOpen(status: string): boolean {
  const s = status.toLowerCase();
  return s !== 'close' && s !== 'closed' && s !== 'cancelled';
}

function isClose(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'close' || s === 'closed';
}

function classifySegment(row: RekapTicketRow): { segment: string | null; isB2c: boolean; isB2b: boolean } {
  const jenis = row.jenis_tiket;
  const isB2c = isB2CJenis(jenis);
  const isB2b = isB2BJenis(jenis);

  if (isB2c) {
    const ct = (row.customer_type ?? '').toUpperCase();
    if (ct.includes('DIAMOND')) return { segment: 'diamond', isB2c: true, isB2b: false };
    if (ct.includes('PLATINUM')) return { segment: 'platinum', isB2c: true, isB2b: false };
    const normalized = normalizeJenis(jenis);
    if (normalized === 'sqm') return { segment: 'sqmB2c', isB2c: true, isB2b: false };
    return { segment: 'goldReg', isB2c: true, isB2b: false };
  }

  if (isB2b) {
    const normalized = normalizeJenis(jenis);
    if (normalized === 'datin' || normalized === 'vpn-ip') return { segment: 'datin', isB2c: false, isB2b: true };
    if (normalized === 'sqm-ccan') return { segment: 'sqmB2b', isB2c: false, isB2b: true };
    if (normalized === 'tsel') return { segment: 'tsel', isB2c: false, isB2b: true };
    return { segment: 'nonDatin', isB2c: false, isB2b: true };
  }

  return { segment: null, isB2c: false, isB2b: false };
}

function emptyB2c(): SARow['b2c'] {
  return {
    diamond: { open: 0, close: 0 }, platinum: { open: 0, close: 0 },
    goldReg: { open: 0, close: 0 }, sqmB2c: { open: 0, close: 0 },
  };
}

function emptyB2b(): SARow['b2b'] {
  return {
    datin: { open: 0, close: 0 }, nonDatin: { open: 0, close: 0 },
    sqmB2b: { open: 0, close: 0 }, tsel: { open: 0, close: 0 },
  };
}

function emptyWzB2c(): WorkzoneRow['b2c'] {
  return {
    diamond: { open: 0, close: 0 }, platinum: { open: 0, close: 0 },
    goldReg: { open: 0, close: 0 }, sqmB2c: { open: 0, close: 0 },
  };
}

function emptyWzB2b(): WorkzoneRow['b2b'] {
  return {
    datin: { open: 0, close: 0 }, nonDatin: { open: 0, close: 0 },
    sqmB2b: { open: 0, close: 0 }, tsel: { open: 0, close: 0 },
  };
}

function buildRekapResponse(
  ticketRows: RekapTicketRow[],
  teknisiRows: { sa_name: string; cnt: bigint }[],
  syncDate: string,
): RekapResponse {
  const teknisiMap = new Map(teknisiRows.map((r) => [r.sa_name, Number(r.cnt)]));

  const saMap = new Map<string, {
    area: string;
    b2c: SARow['b2c'];
    b2b: SARow['b2b'];
    workzones: Map<string, WorkzoneRow>;
    jenisTiket: Record<string, SegCount>;
  }>();

  for (const row of ticketRows) {
    const key = row.sa_name;
    if (!saMap.has(key)) {
      saMap.set(key, {
        area: row.area,
        b2c: emptyB2c(),
        b2b: emptyB2b(),
        workzones: new Map(),
        jenisTiket: {},
      });
    }

    const sa = saMap.get(key)!;
    const { segment, isB2c, isB2b } = classifySegment(row);
    if (!segment) continue;
    const cnt = Number(row.cnt);
    const open = isOpen(row.status_update) ? cnt : 0;
    const close = isClose(row.status_update) ? cnt : 0;

    const jtKey = (row.jenis_tiket ?? 'UNKNOWN').toUpperCase();
    if (!sa.jenisTiket[jtKey]) sa.jenisTiket[jtKey] = { open: 0, close: 0 };
    sa.jenisTiket[jtKey].open += open;
    sa.jenisTiket[jtKey].close += close;

    if (isB2c) {
      (sa.b2c as Record<string, SegCount>)[segment].open += open;
      (sa.b2c as Record<string, SegCount>)[segment].close += close;
    } else if (isB2b) {
      (sa.b2b as Record<string, SegCount>)[segment].open += open;
      (sa.b2b as Record<string, SegCount>)[segment].close += close;
    }

    const wzCode = row.workzone ?? 'UNKNOWN';
    if (!sa.workzones.has(wzCode)) {
      sa.workzones.set(wzCode, {
        workzone: wzCode,
        b2c: emptyWzB2c(),
        b2b: emptyWzB2b(),
        totalOpen: 0, totalClose: 0,
      });
    }
    const wz = sa.workzones.get(wzCode)!;
    if (isB2c) {
      (wz.b2c as Record<string, SegCount>)[segment].open += open;
      (wz.b2c as Record<string, SegCount>)[segment].close += close;
    } else if (isB2b) {
      (wz.b2b as Record<string, SegCount>)[segment].open += open;
      (wz.b2b as Record<string, SegCount>)[segment].close += close;
    }
    wz.totalOpen += open;
    wz.totalClose += close;
  }

  const rows: SARow[] = [];
  let no = 1;
  for (const [saName, data] of saMap) {
    const teknisiMasuk = teknisiMap.get(saName) ?? 0;
    const totalOpen = Object.values(data.b2c).reduce((s, v) => s + v.open, 0) + Object.values(data.b2b).reduce((s, v) => s + v.open, 0);
    const totalClose = Object.values(data.b2c).reduce((s, v) => s + v.close, 0) + Object.values(data.b2b).reduce((s, v) => s + v.close, 0);
    const workzoneRows = Array.from(data.workzones.values())
      .sort((a, b) => a.workzone.localeCompare(b.workzone));

    rows.push({
      no: no++, area: data.area, saName, teknisiMasuk,
      woPerTeknisi: teknisiMasuk > 0 ? (totalOpen / teknisiMasuk).toFixed(1) : '—',
      b2c: data.b2c, b2b: data.b2b, workzones: workzoneRows,
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
  };
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const workzones = isSuperAdmin ? null : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({ rows: [], totals: {}, timestamp: new Date().toISOString(), syncDate: today, title: 'REKAP WORKORDER ASSURANCE', subtitle: '[REGULER - HVC - SQM]' });
    }

    const cacheKey = `dashboard:rekap:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (workzones ?? []).sort().join(',')}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const whereWz = workzones && workzones.length > 0
        ? Prisma.sql`AND t.workzone IN (${Prisma.join(workzones)})`
        : Prisma.sql``;

      const ticketRows = await prisma.$queryRaw<RekapTicketRow[]>`
        SELECT
          a.nama_area                     AS area,
          sa.nama_sa                      AS sa_name,
          t.workzone,
          t.customer_type,
          COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
          t.guarantee_status              AS guarante_status,
          LOWER(COALESCE(t.status_update, 'open')) AS status_update,
          t.jam_expired,
          t.status_ttr_12_gold            AS jam_expired_gold,
          t.status_ttr_3_diamond          AS jam_expired_diamond,
          t.status_ttr_6_platinum         AS jam_expired_platinum,
          t.closed_at,
          COUNT(*) AS cnt
        FROM ticket t
        JOIN service_area sa ON sa.nama_sa = t.workzone
        JOIN area a          ON a.id_area = sa.area_id
        LEFT JOIN branch b   ON b.id_branch = a.branch_id
        WHERE t.sync_date = ${today}
          ${whereWz}
        GROUP BY a.nama_area, sa.nama_sa, t.workzone, t.customer_type,
                 COALESCE(t.jenis_tiket_2, t.jenis_tiket_1),
                 t.guarantee_status, LOWER(COALESCE(t.status_update, 'open')),
                 t.jam_expired, t.status_ttr_12_gold,
                 t.status_ttr_3_diamond, t.status_ttr_6_platinum, t.closed_at
        ORDER BY a.nama_area, sa.nama_sa, t.workzone
      `;

      const teknisiRows = await prisma.$queryRaw<{ sa_name: string; cnt: bigint }[]>`
        SELECT sa.nama_sa AS sa_name, COUNT(DISTINCT a.technician_id) AS cnt
        FROM technician_attendance a
        JOIN service_area sa ON sa.id_sa = a.workzone_id
        JOIN users u ON u.id_user = a.technician_id
        JOIN roles ro ON ro.id_role = u.role_id
        WHERE a.date = ${today}
          AND ro.key = 'teknisi'
          ${workzones && workzones.length > 0 ? Prisma.sql`AND sa.nama_sa IN (${Prisma.join(workzones)})` : Prisma.sql``}
        GROUP BY sa.nama_sa
      `;

      return buildRekapResponse(ticketRows, teknisiRows, today);
    }, 120);

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Rekap workorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
