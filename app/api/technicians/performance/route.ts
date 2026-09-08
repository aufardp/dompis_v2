export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getOrSetCache } from '@/lib/cache';
import {
  getRekapCloseTeknisi,
  type RecapSpesialisasi,
} from '@/app/libs/services/recap-close.service';

const CACHE_TTL_SECONDS = 60;
const WIB_OFFSET = '+07:00';

/** "YYYY-MM-DD" → Date pada 00:00 WIB. Invalid → null. */
function parseWibDate(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00${WIB_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSpesialisasi(raw: string | null): RecapSpesialisasi {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'b2c' ? 'b2c' : 'b2b';
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
    const dateFrom = parseWibDate(searchParams.get('date_from'));
    const dateToRaw = parseWibDate(searchParams.get('date_to'));
    if (!dateFrom || !dateToRaw) {
      return NextResponse.json(
        { success: false, message: 'date_from / date_to wajib (YYYY-MM-DD)' },
        { status: 400 },
      );
    }
    const dateTo = new Date(dateToRaw.getTime() + 24 * 60 * 60 * 1000);
    if (dateTo <= dateFrom) {
      return NextResponse.json(
        { success: false, message: 'Rentang tanggal tidak valid' },
        { status: 400 },
      );
    }

    const serviceArea = searchParams.get('service_area')?.trim() || undefined;
    const spesialisasi = normalizeSpesialisasi(searchParams.get('spesialisasi'));
    const q = searchParams.get('q')?.trim() || undefined;
    const includeEmpty = searchParams.get('include_empty') === '1';

    const cacheKey = [
      'technicians_recap_close',
      user.role,
      user.id_user,
      searchParams.get('date_from'),
      searchParams.get('date_to'),
      serviceArea ?? 'all',
      spesialisasi,
      includeEmpty ? 'inc' : 'act',
      q ?? '',
    ].join(':');

    const result = await getOrSetCache(
      cacheKey,
      () =>
        getRekapCloseTeknisi({
          adminUserId: user.id_user,
          dateFrom,
          dateTo,
          serviceArea,
          spesialisasi,
          q,
          includeEmpty,
        }),
      CACHE_TTL_SECONDS,
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal memuat rekap') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
