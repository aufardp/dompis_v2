export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError } from '@/app/libs/apiError';
import * as XLSX from 'xlsx';

const ODC_COLUMN_ALIASES = [
  'odc_value', 'odcvalue', 'odc',
  'ODC_VALUE', 'ODCValue', 'ODC',
  'odc value', 'odcvalue',
];

const AREA_COLUMN_ALIASES = [
  'area_name', 'areaname', 'area',
  'nama_area', 'namaarea',
  'AREA_NAME', 'AREA', 'NAMA_AREA',
  'Nama Area', 'Nama_Area',
  'area name',
];

interface RouteParams {
  params: Promise<{ id: string }>;
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase().trim());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detect delimiter: check first line — use tab if tabs present, otherwise comma
  const rawFirst = lines[0];
  const hasTab = rawFirst.includes('\t');
  const delimiter = hasTab ? '\t' : ',';

  // Strip BOM if present
  const cleanFirst = rawFirst.replace(/^\ufeff/, '');
  const headers = parseCSVLine(cleanFirst, delimiter).map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cleanLine = lines[i].replace(/^\ufeff/, '');
    const values = parseCSVLine(cleanLine, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    if (isNaN(clusterId)) {
      throw new ApiError(400, 'Invalid cluster ID');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (file.size > 50 * 1024 * 1024)
      throw new ApiError(400, 'File terlalu besar (maks 50MB)');

    const buffer = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    let rows: Record<string, unknown>[] = [];

    const bytes = new Uint8Array(buffer);
    const isZIP = bytes[0] === 0x50 && bytes[1] === 0x4B; // "PK" = ZIP/XLSX
    const isOLE2 = bytes[0] === 0xD0 && bytes[1] === 0xCF; // OLE2 = old .xls

    // Parse based on actual binary format, NOT filename extension
    if (isZIP) {
      const workbook = XLSX.read(Buffer.from(buffer), {
        type: 'buffer',
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: '',
      }) as Record<string, unknown>[];
    } else if (isOLE2) {
      const workbook = XLSX.read(Buffer.from(buffer), {
        type: 'buffer',
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: '',
      }) as Record<string, unknown>[];
    } else {
      rows = parseCSV(
        new TextDecoder('utf-8', { fatal: false }).decode(bytes),
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'File kosong atau tidak memiliki data',
      }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);

    const odcCol = findColumn(headers, ODC_COLUMN_ALIASES);
    const areaCol = findColumn(headers, AREA_COLUMN_ALIASES);

    if (!odcCol) {
      return NextResponse.json({
        success: false,
        message: `Kolom ODC tidak ditemukan. Kolom tersedia: ${headers.join(', ')}`,
      }, { status: 400 });
    }

    // Validate first row — if it looks like binary, file was likely not parsed correctly
    const firstValue = String(rows[0][odcCol] ?? '').trim();
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(firstValue) || firstValue.length > 200) {
      return NextResponse.json({
        success: false,
        message: `File tidak terbaca dengan benar. Pastikan format file adalah .xlsx, .csv, atau .txt — bukan .xls biner.`,
      }, { status: 400 });
    }

    const parsed = rows
      .map((row) => {
        const odc_value = String(row[odcCol] ?? '').trim();
        const area_name = areaCol ? String(row[areaCol] ?? '').trim() : '';
        return { odc_value, area_name };
      })
      .filter((r) => r.odc_value.length > 0);

    const total = parsed.length;
    const preview = parsed.slice(0, 20);

    return NextResponse.json({
      success: true,
      data: {
        rows: parsed,
        total,
        preview,
        odcColumn: odcCol,
        areaColumn: areaCol,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}