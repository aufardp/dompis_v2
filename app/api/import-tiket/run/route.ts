export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/app/libs/prisma';
import { randomBytes } from 'crypto';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  TICKET_RAW_FIELDS,
  REQUIRED_FIELDS,
  validateDate,
} from '@/app/libs/ticket-raw-columns';

const BATCH_SIZE = 100;

function findColumnValue(
  row: Record<string, any>,
  mapping: Record<string, string | null>,
  targetField: string,
): string | null {
  const header = Object.entries(mapping).find(([, v]) => v === targetField)?.[0];
  if (!header) return null;
  const value = row[header];
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function parseDateValue(raw: string | null): Date | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'import-tiket-run',
      limit: 5,
      windowSeconds: 120,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mappingJson = formData.get('mapping') as string | null;
    const rawBatchName = formData.get('batch_name') as string | null;
    let batchName = (rawBatchName ?? '').trim();
    if (!batchName) {
      const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const rand = randomBytes(4).toString('hex');
      batchName = `Import_${ts}_${rand}`;
    } else if (batchName.length > 100) {
      throw new ApiError(400, 'Nama batch maksimal 100 karakter');
    }

    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (!mappingJson) throw new ApiError(400, 'Mapping kolom tidak ditemukan');

    const mapping: Record<string, string | null> = JSON.parse(mappingJson);

    const missingRequired = REQUIRED_FIELDS.filter(
      (f) => !Object.values(mapping).includes(f),
    );
    if (missingRequired.length > 0) {
      const labels = missingRequired.map(
        (key) => TICKET_RAW_FIELDS.find((f) => f.key === key)?.label ?? key,
      );
      throw new ApiError(400, `Field wajib belum diisi: ${labels.join(', ')}`);
    }

    const existingBatch = await prisma.ticket_raw.findFirst({
      where: { import_batch: batchName },
      select: { import_batch: true },
    });

    if (existingBatch) {
      const count = await prisma.ticket_raw.count({
        where: { import_batch: { startsWith: batchName } },
      });
      batchName = `${batchName}_${count + 1}`;
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(buffer), {
      type: 'buffer',
      cellDates: true,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd hh:mm:ss',
      defval: null,
    });

    if (rows.length === 0)
      throw new ApiError(400, 'File Excel kosong atau tidak valid');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const parsedRows: { incident: string; data: Record<string, any> }[] = [];

      for (const row of batch) {
        const incident = findColumnValue(row, mapping, 'incident');
        if (!incident) { skipped++; continue; }

        const status = findColumnValue(row, mapping, 'status');
        if (!status) { skipped++; continue; }

        const reportedDate = findColumnValue(row, mapping, 'reported_date');
        if (!reportedDate || !validateDate(reportedDate)) { skipped++; continue; }

        const data: Record<string, any> = {
          incident,
          status,
          reported_date: reportedDate,
          source_system: 'import',
          import_batch: batchName,
          synced_at: new Date(),
        };

        for (const ticketField of TICKET_RAW_FIELDS) {
          if (['incident', 'status', 'reported_date', 'source_system', 'import_batch'].includes(ticketField.key)) continue;
          const value = findColumnValue(row, mapping, ticketField.key);
          if (value !== null) {
            if (ticketField.type === 'date') {
              const parsed = parseDateValue(value);
              if (parsed) data[ticketField.key] = parsed;
            } else {
              data[ticketField.key] = value;
            }
          }
        }

        parsedRows.push({ incident, data });
      }

      if (parsedRows.length === 0) continue;

      const existingIncidents = await prisma.ticket_raw.findMany({
        where: { incident: { in: parsedRows.map((r) => r.incident) } },
        select: { incident: true },
      });
      const existingSet = new Set(existingIncidents.map((r) => r.incident));

      const createOps = [];
      const updateOps = [];

      for (const { incident, data } of parsedRows) {
        if (existingSet.has(incident)) {
          updateOps.push(
            prisma.ticket_raw.update({ where: { incident }, data }),
          );
        } else {
          createOps.push(
            prisma.ticket_raw.create({ data }),
          );
        }
      }

      if (createOps.length > 0) {
        await prisma.$transaction(createOps);
        inserted += createOps.length;
      }
      if (updateOps.length > 0) {
        await prisma.$transaction(updateOps);
        updated += updateOps.length;
      }
    }

    await prisma.projection_request.create({
      data: {
        source: 'import-tiket',
        syncBatchId: batchName,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        inserted,
        updated,
        skipped,
        failed,
        errors,
        import_batch: batchName,
      },
      message: `Import berhasil. ${inserted} baru, ${updated} diperbarui, ${skipped} dilewati. Data akan muncul di board dalam ~1 menit.`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal import file'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
