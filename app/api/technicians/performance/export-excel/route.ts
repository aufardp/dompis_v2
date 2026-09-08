export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getRekapCloseTeknisi,
  getRekapCloseDetail,
  type RecapSpesialisasi,
} from '@/app/libs/services/recap-close.service';

const COLUMN_LABEL: Record<string, string> = {
  CUS: 'CUST',
  PRO: 'PROC',
  OHI: 'U-OHI',
  REP: 'OBST',
  MAN: 'MNUL',
  LAIN: 'LAIN',
};

const WIB_OFFSET = '+07:00';

function parseWibDate(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00${WIB_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSpesialisasi(raw: string | null): RecapSpesialisasi {
  return (raw ?? '').trim().toLowerCase() === 'b2c' ? 'b2c' : 'b2b';
}

export async function GET(req: NextRequest) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);
    if (!isAdminRole(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const dfRaw = searchParams.get('date_from');
    const dtRaw = searchParams.get('date_to');
    const dateFrom = parseWibDate(dfRaw);
    const dateToRaw = parseWibDate(dtRaw);
    if (!dateFrom || !dateToRaw) {
      return NextResponse.json(
        { success: false, message: 'date_from / date_to wajib (YYYY-MM-DD)' },
        { status: 400 },
      );
    }
    const dateTo = new Date(dateToRaw.getTime() + 24 * 60 * 60 * 1000);
    const serviceArea = searchParams.get('service_area')?.trim() || undefined;
    const spesialisasi = normalizeSpesialisasi(searchParams.get('spesialisasi'));
    const q = searchParams.get('q')?.trim() || undefined;
    const includeEmpty = searchParams.get('include_empty') === '1';

    const filterArgs = {
      adminUserId: user.id_user,
      dateFrom,
      dateTo,
      serviceArea,
      spesialisasi,
      q,
      includeEmpty,
    };
    const [{ rows }, detail] = await Promise.all([
      getRekapCloseTeknisi(filterArgs),
      getRekapCloseDetail(filterArgs),
    ]);

    const sheet = rows.map((r, i) => ({
      NO: i + 1,
      Teknisi: r.nama,
      NIK: r.nik ?? '-',
      WITEL: r.witel,
      SA: r.service_area,
      'Hari Hadir': r.hari_hadir,
      CUST: r.counts.CUS,
      PROC: r.counts.PRO,
      'U-OHI': r.counts.OHI,
      OBST: r.counts.REP,
      MNUL: r.counts.MAN,
      LAIN: r.counts.LAIN,
      'Total Close': r.total_close,
      BOBOT: r.bobot,
      'BOBOT AVG': r.bobot_avg ?? '-',
      PRODUCTIVITY: r.produktivitas ?? '-',
      'Realisasi (jam)': r.realisasi,
      'Produktivitas (tiket/hari)': r.produktivitas_jam,
      Target: r.target,
    }));

    const detailSheet = detail.map((d, i) => ({
      NO: i + 1,
      Teknisi: d.nama,
      NIK: d.nik ?? '-',
      WITEL: d.witel || '-',
      'No Tiket': d.incident,
      Source: COLUMN_LABEL[d.column] ?? d.column,
      Customer: d.customer || '-',
      'Service No': d.service_no || '-',
      Jenis: d.jenis || '-',
      Workzone: d.workzone || '-',
      RCA: d.rca || '-',
      'Sub RCA': d.sub_rca || '-',
      Solusi: d.solusi || '-',
      'Tgl Lapor': d.reported_date
        ? new Date(d.reported_date).toLocaleString('id-ID')
        : '-',
      'Tgl Selesai': d.closed_at
        ? new Date(d.closed_at).toLocaleString('id-ID')
        : '-',
      'Resolve (jam)': d.resolve_hours ?? '-',
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(sheet),
      'Ringkasan',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        detailSheet.length > 0
          ? detailSheet
          : [{ Info: 'Tidak ada tiket close pada rentang & filter ini' }],
      ),
      'Detail Tiket',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `Rekap_Close_Teknisi_${dfRaw}_sd_${dtRaw}.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Export gagal') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
