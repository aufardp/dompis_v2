export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError } from '@/app/libs/apiError';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { invalidateTicketsCache } from '@/lib/cache';

const BATCH_SIZE = 100;

const TECH_COLUMN_CANDIDATES = [
  'TECHNICIAN',
  'TEKNISI',
  'CLOSED BY',
  'OWNER',
  'ASSIGNEE',
];
const STATUS_COLUMN_CANDIDATES = ['STATUS', 'TICKET STATUS', 'TICKET_STATUS'];
const INCIDENT_COLUMN_CANDIDATES = [
  'INCIDENT',
  'INCIDENT ID',
  'INCIDENT_NO',
  'TICKET ID',
  'TICKET_NO',
];
const RESOLVE_DATE_COLUMN_CANDIDATES = [
  'RESOLVE DATE',
  'RESOLVED DATE',
  'CLOSED DATE',
  'STATUS DATE',
  'RESOLVE_DATE',
  'RESOLVED_DATE',
];
const WORKFLOW_PROTECTED_STATUSES = new Set([
  'assigned',
  'on_progress',
  'pending',
]);

function findColumn(
  row: Record<string, any>,
  candidates: string[],
): string | null {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const key = keys.find(
      (k) => k.trim().toUpperCase().replace(/\s+/g, ' ') === c.toUpperCase(),
    );
    if (key && row[key] != null) return String(row[key]).trim() || null;
  }
  return null;
}

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;

  const str = String(raw).trim();
  if (!str) return null;

  // DD/MM/YYYY HH:MM atau DD/MM/YYYY
  const m = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (m) {
    return new Date(
      parseInt(m[3]),
      parseInt(m[2]) - 1,
      parseInt(m[1]),
      parseInt(m[4] ?? '0'),
      parseInt(m[5] ?? '0'),
    );
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mappingJson = formData.get('mapping') as string | null;
    const defaultJenis =
      (formData.get('default_jenis') as string) ?? 'reguler';
    const syncDateStr =
      (formData.get('sync_date') as string) ??
      new Date().toISOString().split('T')[0];
    const importBatch =
      (formData.get('import_batch') as string) ??
      `IMPORT_EXCEL_${Date.now()}`;
    const onlyClosedStr = (formData.get('only_closed') as string) ?? 'true';
    const onlyClosed = onlyClosedStr === 'true';

    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (!mappingJson)
      throw new ApiError(400, 'Mapping teknisi tidak ditemukan');

    // Parse mapping: { "Kusmono GGN": 12, "Ahmad Arif": 15 }
    const nameToIdMap: Record<string, number> = JSON.parse(mappingJson);

    // Parse Excel di server
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

    const syncDate = new Date(syncDateStr);
    let inserted = 0,
      updated = 0,
      skipped = 0,
      failed = 0;
    const errors: string[] = [];

    // Process dalam batch
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        try {
          const incident = findColumn(row, INCIDENT_COLUMN_CANDIDATES)?.trim();
          if (!incident) {
            skipped++;
            continue;
          }

          const statusFromExcel = (
            findColumn(row, STATUS_COLUMN_CANDIDATES) ?? ''
          ).toUpperCase();
          if (onlyClosed && !['CLOSED', 'CLOSE', 'SELESAI'].includes(statusFromExcel)) {
            skipped++;
            continue;
          }

          const techName = findColumn(row, TECH_COLUMN_CANDIDATES);
          const teknisiId = techName ? nameToIdMap[techName] : undefined;

          // Skip jika tidak ada mapping teknisi
          if (!teknisiId) {
            skipped++;
            continue;
          }

          // Parse RESOLVE DATE
          const rawDate = findColumn(row, RESOLVE_DATE_COLUMN_CANDIDATES);
          const closedAt = parseDate(rawDate);
          if (!closedAt) {
            skipped++;
            continue;
          }

          // Build ticket data
          const ticketData = {
            teknisi_user_id: teknisiId,
            jenis_tiket: defaultJenis,
            status_update: 'close',
            status: findColumn(row, STATUS_COLUMN_CANDIDATES) ?? 'CLOSED',
            closed_at: closedAt,
            sync_date: syncDate,
            import_batch: importBatch,
            workzone: findColumn(row, ['WORKZONE', 'WITEL']),
            customer_type: findColumn(row, [
              'CUSTOMER TYPE',
              'CUSTOMER_TYPE',
            ]),
            summary: findColumn(row, ['SUMMARY']),
            reported_date: findColumn(row, [
              'REPORTED DATE',
              'REPORTED_DATE',
            ]),
            owner_group: findColumn(row, ['OWNER GROUP', 'OWNER_GROUP']),
            service_no: findColumn(row, [
              'SERVICE NO',
              'SERVICE_NO',
              'SERVICE ID',
            ]),
            contact_name: findColumn(row, [
              'CONTACT NAME',
              'CUSTOMER NAME',
            ]),
            description_solution_dompis: findColumn(row, [
              'DESCRIPTION ACTUAL SOLUTION',
              'SOLUTION',
              'RESOLUTION',
            ]),
            rk_information: findColumn(row, [
              'RK INFORMATION',
              'RK_INFORMATION',
            ]),
            symptom: findColumn(row, ['SYMPTOM']),
            lapul: findColumn(row, ['LAPUL']),
            gaul: findColumn(row, ['GAUL']),
          };

          // Upsert: INSERT atau UPDATE
          const existing = await prisma.ticket.findUnique({
            where: { incident: incident },
            select: { id_ticket: true, status_update: true },
          });

          if (existing) {
            // Jangan timpa tiket yang sedang on_progress/pending via workflow
            if (
              WORKFLOW_PROTECTED_STATUSES.has(
                (existing.status_update ?? '').toLowerCase().trim(),
              )
            ) {
              skipped++;
              continue;
            }
            await prisma.ticket.update({
              where: { incident: incident },
              data: ticketData,
            });
            updated++;
          } else {
            await prisma.ticket.create({
              data: { incident: incident, ...ticketData },
            });
            inserted++;
          }
        } catch (err) {
          failed++;
          if (errors.length < 20) {
            errors.push(
              `Row ${i + 1}: ${err instanceof Error ? err.message : 'error'}`,
            );
          }
        }
      }

      // Small delay to prevent DB connection pool exhaustion
      await new Promise((r) => setTimeout(r, 50));
    }

    await invalidateTicketsCache();

    return NextResponse.json({
      success: true,
      data: {
        inserted,
        updated,
        skipped,
        failed,
        errors,
        total: rows.length,
        import_batch: importBatch,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal import data'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
