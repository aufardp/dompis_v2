export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { calculateManhours, getStoOptions, getManhourConfigs } from '@/app/libs/services/manhours.service';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWIB } from '@/app/utils/datetime';

/**
 * GET /api/technicians/manhours
 * 
 * Query parameters:
 * - date_from: YYYY-MM-DD (required)
 * - date_to: YYYY-MM-DD (required)
 * - sto: string (optional)
 * - name: string (optional)
 * 
 * Returns manhours calculation for technicians filtered by date range, STO, and name
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const user = await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const dateFromStr = searchParams.get('date_from');
    const dateToStr = searchParams.get('date_to');
    const sto = searchParams.get('sto') || undefined;
    const name = searchParams.get('name') || undefined;

    // Validate required parameters
    if (!dateFromStr || !dateToStr) {
      return NextResponse.json(
        { success: false, message: 'Parameter date_from dan date_to wajib diisi' },
        { status: 400 },
      );
    }

    // Parse dates with WIB timezone
    // date_from = start of day (00:00:00)
    // date_to = end of day (23:59:59)
    const dateFrom = parseDateWithTimezone(dateFromStr, 'start');
    const dateTo = parseDateWithTimezone(dateToStr, 'end');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { success: false, message: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD' },
        { status: 400 },
      );
    }

    // Validate date range
    if (dateFrom > dateTo) {
      return NextResponse.json(
        { success: false, message: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir' },
        { status: 400 },
      );
    }

    // Get admin's workzones for filtering
    const adminWorkzones = await getWorkzonesForUser(user.id_user);

    // Calculate manhours
    const rows = await calculateManhours(
      {
        dateFrom,
        dateTo,
        sto,
        name,
      },
      adminWorkzones,
    );

    // Get configs for dynamic column headers
    const configs = await getManhourConfigs();

    // Get STO options for filter dropdown
    const stoOptions = await getStoOptions(adminWorkzones);

    return NextResponse.json({
      success: true,
      rows,
      configs,
      stoOptions,
      dateFrom: formatDate(dateFrom),
      dateTo: formatDate(dateTo),
    });
  } catch (error: any) {
    console.error('[MANHOURS_API_ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Terjadi kesalahan saat mengambil data manhours',
      },
      { status: 500 },
    );
  }
}

/**
 * Parse date string with WIB timezone
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param time - 'start' for 00:00:00, 'end' for 23:59:59
 */
function parseDateWithTimezone(
  dateStr: string,
  time: 'start' | 'end',
): Date | null {
  // Validate format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return null;
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Validate date components
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Create date in WIB timezone (UTC+7)
  // We'll create the date and then adjust for WIB offset
  const hour = time === 'start' ? 0 : 23;
  const minute = time === 'start' ? 0 : 59;
  const second = time === 'start' ? 0 : 59;

  // Create date object (interpreted as local time, then we adjust)
  const date = new Date(year, month - 1, day, hour, minute, second);

  // Convert to WIB by treating the input as WIB time
  // WIB is UTC+7, so we need to subtract 7 hours from the UTC representation
  const wibOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
  
  // Create a date that represents the WIB time correctly
  const utcTime = date.getTime() - (date.getTimezoneOffset() * 60 * 1000);
  const wibTime = utcTime - wibOffset;
  
  return new Date(wibTime);
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
