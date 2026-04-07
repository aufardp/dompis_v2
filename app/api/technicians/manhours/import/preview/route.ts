export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError } from '@/app/libs/apiError';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

const TECH_COLUMN_CANDIDATES = [
  'TECHNICIAN',
  'TEKNISI',
  'CLOSED BY',
  'OWNER',
  'ASSIGNEE',
  'ASSIGNED TO',
];

const STATUS_COLUMN_CANDIDATES = ['STATUS', 'TICKET STATUS', 'TICKET_STATUS'];
const INCIDENT_COLUMN_CANDIDATES = [
  'INCIDENT',
  'INCIDENT ID',
  'INCIDENT_NO',
  'TICKET ID',
  'TICKET_NO',
  'TICKET',
];
const RESOLVE_DATE_COLUMN_CANDIDATES = [
  'RESOLVE DATE',
  'RESOLVED DATE',
  'CLOSED DATE',
  'STATUS DATE',
  'RESOLVE_DATE',
  'RESOLVED_DATE',
  'CLOSED_DATE',
  'STATUS_DATE',
];

function findColumn(
  row: Record<string, any>,
  candidates: string[],
): string | null {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const key = keys.find(
      (k) => k.trim().toUpperCase().replace(/\s+/g, ' ') ===
        candidate.toUpperCase(),
    );
    if (key && row[key] != null) return String(row[key]).trim() || null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (file.size > 50 * 1024 * 1024)
      throw new ApiError(400, 'File terlalu besar (maks 50MB)');

    // Parse di server — tidak ada batasan memori browser
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(buffer), {
      type: 'buffer',
      cellDates: true,
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd hh:mm:ss',
      defval: null,
    });

    if (rows.length === 0)
      throw new ApiError(400, 'File Excel kosong atau tidak valid');

    // Detect kolom
    const headers = Object.keys(rows[0] ?? {});

    const techCol =
      headers.find((h) =>
        TECH_COLUMN_CANDIDATES.some(
          (c) => h.trim().toUpperCase().replace(/\s+/g, ' ') === c.toUpperCase(),
        )
      ) ?? null;

    // Extract nama unik dari kolom teknisi
    const nameCount = new Map<string, number>();
    for (const row of rows) {
      const name = techCol ? String(row[techCol] ?? '').trim() : '';
      if (name) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    }

    const uniqueNames = Array.from(nameCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Sample rows untuk preview
    const sample = rows.slice(0, 5).map((row) => ({
      incident: findColumn(row, INCIDENT_COLUMN_CANDIDATES),
      resolveDate: findColumn(row, RESOLVE_DATE_COLUMN_CANDIDATES),
      technician: findColumn(row, TECH_COLUMN_CANDIDATES),
      status: findColumn(row, STATUS_COLUMN_CANDIDATES),
      workzone: findColumn(row, ['WORKZONE', 'WITEL']),
    }));

    return NextResponse.json({
      success: true,
      data: {
        total_rows: rows.length,
        unique_technicians: uniqueNames,
        sample,
        tech_column_detected: techCol,
        headers: headers.slice(0, 20),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal preview file'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
