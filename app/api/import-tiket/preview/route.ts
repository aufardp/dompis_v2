export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  TICKET_RAW_FIELDS,
  REQUIRED_FIELDS,
  autoDetectMapping,
  validateDate,
} from '@/app/libs/ticket-raw-columns';

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'import-tiket-preview',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (file.size > 50 * 1024 * 1024)
      throw new ApiError(400, 'File terlalu besar (maks 50MB)');

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

    const headers = Object.keys(rows[0] ?? {});
    const autoMapping = autoDetectMapping(headers);

    const errors: { row: number; field: string; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const requiredField of REQUIRED_FIELDS) {
        const mappingHeader = Object.entries(autoMapping).find(
          ([, v]) => v === requiredField,
        )?.[0];
        if (!mappingHeader) continue;
        const value = row[mappingHeader];
        const fieldDef = TICKET_RAW_FIELDS.find((f) => f.key === requiredField);
        if (value === null || value === undefined || String(value).trim() === '') {
          errors.push({
            row: i + 2,
            field: fieldDef?.label ?? requiredField,
            message: `${fieldDef?.label ?? requiredField} tidak boleh kosong`,
          });
          break;
        }
        if (fieldDef?.type === 'date' && !validateDate(String(value))) {
          errors.push({
            row: i + 2,
            field: fieldDef?.label ?? requiredField,
            message: `Format tanggal tidak valid: "${value}"`,
          });
          break;
        }
      }
    }

    const sample = rows.slice(0, 20).map((row) => {
      const mapped: Record<string, any> = {};
      for (const header of headers) {
        const target = autoMapping[header];
        mapped[target ?? header] = row[header];
      }
      return mapped;
    });

    const missingRequired = REQUIRED_FIELDS.filter(
      (f) => !Object.values(autoMapping).includes(f),
    );

    return NextResponse.json({
      success: true,
      data: {
        total_rows: rows.length,
        valid_rows: rows.length - errors.length,
        invalid_rows: errors.length,
        errors,
        headers,
        auto_mapping: autoMapping,
        sample,
        missing_required: missingRequired.map((key) => {
          const def = TICKET_RAW_FIELDS.find((f) => f.key === key);
          return { key, label: def?.label ?? key };
        }),
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
