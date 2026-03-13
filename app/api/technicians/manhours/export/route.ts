export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { calculateManhours, getManhourConfigs } from '@/app/libs/services/manhours.service';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWIB } from '@/app/utils/datetime';

/**
 * GET /api/technicians/manhours/export
 * 
 * Query parameters:
 * - date_from: YYYY-MM-DD (required)
 * - date_to: YYYY-MM-DD (required)
 * - sto: string (optional)
 * - name: string (optional)
 * 
 * Returns CSV file with manhours data
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

    // Generate CSV
    const csvContent = generateCSV(rows, configs, dateFromStr, dateToStr);

    // Create response with BOM for Excel compatibility
    const BOM = '\ufeff';
    const csvWithBOM = BOM + csvContent;

    return new NextResponse(csvWithBOM, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="manhours_${dateFromStr}_${dateToStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('[MANHOURS_EXPORT_ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Terjadi kesalahan saat export data manhours',
      },
      { status: 500 },
    );
  }
}

/**
 * Generate CSV content from manhours data
 */
function generateCSV(
  rows: Array<{
    technician_id: number;
    nama: string | null;
    nik: string | null;
    sto: string;
    categories: Record<string, number>;
    total_tickets: number;
    realisasi: number;
    jam_efektif: number;
    produktivitas: number;
    target: number;
  }>,
  configs: Array<{
    jenis_key: string;
    label: string;
    manhours: number;
  }>,
  dateFrom: string,
  dateTo: string,
): string {
  // Build header row
  const categoryHeaders = configs.map((c) => c.label);
  const header = [
    'No',
    'Nama',
    'STO',
    ...categoryHeaders,
    'JUMLAH TIKET',
    'PRODUKTIVITAS',
    'TARGET',
    'REALISASI',
    'JAM EFEKTIF',
  ];

  const lines: string[] = [];
  lines.push(header.join(','));

  // Build data rows
  rows.forEach((row, index) => {
    const categoryValues = configs.map((c) => row.categories[c.jenis_key] || 0);

    const dataRow = [
      String(index + 1),
      escapeCSV(row.nama || ''),
      escapeCSV(row.sto),
      ...categoryValues.map(String),
      String(row.total_tickets),
      String(row.produktivitas),
      String(row.target),
      String(row.realisasi),
      String(row.jam_efektif),
    ];

    lines.push(dataRow.join(','));
  });

  return lines.join('\n');
}

/**
 * Escape CSV field value (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parse date string with WIB timezone
 */
function parseDateWithTimezone(
  dateStr: string,
  time: 'start' | 'end',
): Date | null {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return null;
  }

  const [year, month, day] = dateStr.split('-').map(Number);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const hour = time === 'start' ? 0 : 23;
  const minute = time === 'start' ? 0 : 59;
  const second = time === 'start' ? 0 : 59;

  const date = new Date(year, month - 1, day, hour, minute, second);

  const wibOffset = 7 * 60 * 60 * 1000;
  const utcTime = date.getTime() - (date.getTimezoneOffset() * 60 * 1000);
  const wibTime = utcTime - wibOffset;

  return new Date(wibTime);
}
