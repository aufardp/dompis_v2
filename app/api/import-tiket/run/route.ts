export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import Papa from 'papaparse';
import { createHash } from 'crypto';
import prisma from '@/app/libs/prisma';
import { randomBytes } from 'crypto';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { invalidateTicketsCache } from '@/lib/cache';
import { todayWibDateForDb, toWibString } from '@/lib/timezone';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import {
  TICKET_RAW_FIELDS,
  TICKET_RAW_MAX_LENGTHS,
  FIELD_CANDIDATES,
  REQUIRED_FIELDS,
  validateDate,
} from '@/app/libs/ticket-raw-columns';
import { parseWIBDateInput } from '@/app/utils/datetime';
import { logger } from '@/lib/observability/logger';

const BATCH_SIZE = 100;
const MAX_ROWS = 10000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SOURCE_TABLE_NAME = 'import_tiket';
const DATE_STRING_FIELDS: Set<string> = new Set([
  'reported_date',
  'status_date',
  'booking_date',
  'date_modified',
  'resolve_date',
  'last_update_worklog',
]);

function findColumnValue(
  row: Record<string, any>,
  mapping: Record<string, string | null>,
  targetField: string,
): string | null {
  const normalize = (value: string) =>
    value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const header = Object.entries(mapping).find(([, v]) => v === targetField)?.[0];
  const candidates = [
    header,
    targetField,
    targetField.replace(/_/g, ' '),
    ...(FIELD_CANDIDATES[targetField] ?? []),
  ].filter(Boolean) as string[];

  const rowEntries = Object.entries(row);
  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    const matchedEntry = rowEntries.find(
      ([key]) => normalize(String(key)) === normalizedCandidate,
    );
    if (!matchedEntry) continue;
    const value = matchedEntry[1];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text) continue;
    return text;
  }

  return null;
}

function parseDateValue(raw: string | null): Date | null {
  if (!raw) return null;
  const d = parseWIBDateInput(raw);
  return d && !isNaN(d.getTime()) ? d : null;
}

function normalizeImportedStringValue(
  key: string,
  value: string | null,
): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (DATE_STRING_FIELDS.has(key)) {
    const parsed = parseWIBDateInput(trimmed);
    if (parsed && !isNaN(parsed.getTime())) {
      return toWibString(parsed);
    }
    return trimmed;
  }

  return trimmed;
}

function truncateByMaxLength(value: string | null, maxLength?: number): string | null {
  if (value === null || maxLength === undefined) return value;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function sanitizeTicketRawPayload(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };

  for (const [key, maxLength] of Object.entries(TICKET_RAW_MAX_LENGTHS)) {
    const value = sanitized[key];
    if (typeof value !== 'string') continue;
    sanitized[key] = truncateByMaxLength(value, maxLength);
  }

  return sanitized;
}

function computeStableHash(payload: Record<string, unknown>): string {
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    stable[key] = payload[key] ?? null;
  }
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function POST(req: Request) {
  try {
    const actor = await protectApi(['admin', 'superadmin', 'super_admin']);
    const uploader = await prisma.users.findUnique({
      where: { id_user: actor.id_user },
      select: { nama: true, username: true },
    });
    const uploadedBy =
      uploader?.nama?.trim() ||
      uploader?.username?.trim() ||
      `User #${actor.id_user}`;

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
    const providedBatchName = (rawBatchName ?? '').trim();
    let batchName = providedBatchName;
    if (!batchName) {
      const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const rand = randomBytes(4).toString('hex');
      batchName = `Import_${ts}_${rand}`;
    } else if (batchName.length > 100) {
      throw new ApiError(400, 'Nama batch maksimal 100 karakter');
    } else {
      const rand = randomBytes(4).toString('hex');
      const suffix = `_${rand}`;
      const maxBaseLength = 100 - suffix.length;
      if (batchName.length > maxBaseLength) {
        throw new ApiError(400, `Nama batch maksimal ${maxBaseLength} karakter sebelum suffix unik`);
      }
      batchName = `${batchName}${suffix}`;
    }

    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (file.size > MAX_FILE_SIZE)
      throw new ApiError(400, `File terlalu besar (maks ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`);
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

    const csvText = await file.text();
    if (!csvText.trim()) throw new ApiError(400, 'File CSV kosong');

    const parseResult = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    const rows = parseResult.data;
    if (rows.length === 0)
      throw new ApiError(400, 'File CSV kosong atau tidak valid');
    if (rows.length > MAX_ROWS)
      throw new ApiError(413, `Maksimal ${MAX_ROWS.toLocaleString('id-ID')} baris per import. File Anda memiliki ${rows.length.toLocaleString('id-ID')} baris.`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const parsedRows: { incident: string; data: Record<string, any>; raw: Record<string, any>; changedColumns: string[] }[] = [];

      for (const row of batch) {
        const incident = findColumnValue(row, mapping, 'incident');
        if (!incident) { skipped++; continue; }

        const status = findColumnValue(row, mapping, 'status');
        if (!status) { skipped++; continue; }

        const reportedDate = findColumnValue(row, mapping, 'reported_date');
        if (!reportedDate || !validateDate(reportedDate)) { skipped++; continue; }

        const data: Record<string, any> = {};

        for (const ticketField of TICKET_RAW_FIELDS) {
          const value = findColumnValue(row, mapping, ticketField.key);
          data[ticketField.key] = normalizeImportedStringValue(
            ticketField.key,
            value,
          );
        }

        data.incident = incident;
        data.status = status;
        data.reported_date = normalizeImportedStringValue('reported_date', reportedDate);
        data.source_system = 'import';
        data.import_batch = batchName;
        data.synced_at = new Date();

        const sanitizedData = sanitizeTicketRawPayload(data);

        parsedRows.push({ incident, data: sanitizedData, raw: row, changedColumns: [] });
      }

      if (parsedRows.length === 0) continue;

      const existingIncidents = await prisma.ticket_raw.findMany({
        where: { incident: { in: parsedRows.map((r) => r.incident) } },
        take: 10000,
        select: {
          incident: true,
          sourceHash: true,
          syncVersion: true,
          ...Object.fromEntries(TICKET_RAW_FIELDS.map((field) => [field.key, true])),
        } as any,
      });
      const existingMap = new Map<string, Record<string, any>>(
        existingIncidents.map((r) => [String(r.incident ?? ''), r as Record<string, any>]),
      );

      const createOps = [];
      const updateOps = [];

      for (const { incident, data, raw } of parsedRows) {
        const now = new Date();
        const sourceUpdatedAt =
          parseDateValue(data.date_modified as string | null) ??
          parseDateValue(data.status_date as string | null) ??
          parseDateValue(data.booking_date as string | null) ??
          now;
        const sourceHash = computeStableHash(data);
        const existing = existingMap.get(incident);
        const changedColumns = TICKET_RAW_FIELDS
          .map((field) => field.key)
          .filter((key) => {
            const current = existing ? (existing as Record<string, any>)[key] : null;
            const next = data[key] ?? null;
            return String(current ?? '').trim() !== String(next ?? '').trim();
          });
        const syncVersion =
          existing && existing.sourceHash !== sourceHash
            ? (existing.syncVersion ?? 1) + 1
            : existing?.syncVersion ?? 1;
        const payload = {
          ...data,
          source_system: 'import',
          sourceTable: SOURCE_TABLE_NAME,
          sourceHash,
          sourceUpdatedAt,
          lastSeenAt: now,
          sync_date: todayWibDateForDb(),
          importedAt: now,
          syncBatchId: batchName,
          syncVersion,
          isActive: true,
          rawPayload: {
            ...raw,
            __importMeta: {
              changedColumns,
              sourceHash,
            },
          },
        };

        if (existing) {
          updateOps.push(
            prisma.ticket_raw.update({ where: { incident }, data: payload }),
          );
        } else {
          createOps.push(
            prisma.ticket_raw.create({ data: payload }),
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

    try {
      await prisma.$executeRaw(
        Prisma.sql`INSERT INTO projection_request (source, sync_batch_id, uploaded_by)
          VALUES ('import-tiket', ${batchName}, ${uploadedBy})`,
      );
    } catch (projectionError) {
      const message = projectionError instanceof Error
        ? projectionError.message.toLowerCase()
        : '';
      const canRetryWithoutUploader =
        message.includes('uploaded_by') ||
        message.includes('column') ||
        message.includes('unknown column');

      if (!canRetryWithoutUploader) {
        throw projectionError;
      }

      await prisma.$executeRaw(
        Prisma.sql`INSERT INTO projection_request (source, sync_batch_id)
          VALUES ('import-tiket', ${batchName})`,
      );
    }

    await invalidateTicketsCache();

    logger.info(`Projection queued for batch ${batchName}`);

    broadcastTicketInvalidate('import-tiket');

    return NextResponse.json({
      success: true,
      data: {
        inserted,
        updated,
        skipped,
        failed,
        errors,
        import_batch: batchName,
        uploaded_by: uploadedBy,
      },
      message: `Import berhasil. ${inserted} baru, ${updated} diperbarui, ${skipped} dilewati. Data diproses di background ke tabel utama.`,
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
