import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { invalidateTicketsCache } from '@/lib/cache';

const BATCH_SIZE = 50;

interface ImportRow {
  incident: string;
  teknisi_user_id: number;
  jenis_tiket: string;
  closed_at: string;
  sync_date: string;
  status_update: string;
  workzone?: string | null;
  customer_type?: string | null;
  summary?: string | null;
  reported_date?: string | null;
  owner_group?: string | null;
  service_no?: string | null;
  contact_name?: string | null;
  description_actual_solution?: string | null;
  rk_information?: string | null;
  symptom?: string | null;
  lapul?: string | null;
  gaul?: string | null;
}

interface ImportRequest {
  rows: ImportRow[];
  import_batch: string;
}

const WORKFLOW_PROTECTED_STATUSES = new Set([
  'assigned',
  'on_progress',
  'pending',
  'close',
  'closed',
]);

function isWorkflowProtected(status: string | null | undefined): boolean {
  if (!status) return false;
  return WORKFLOW_PROTECTED_STATUSES.has(status.toLowerCase().trim());
}

async function batchUpsert(
  prisma: any,
  rows: ImportRow[],
  importBatch: string,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);

    for (const row of chunk) {
      try {
        const closedAt = new Date(row.closed_at);
        if (isNaN(closedAt.getTime())) {
          result.errors.push(
            `${row.incident}: format tanggal tidak valid (${row.closed_at})`,
          );
          result.skipped++;
          continue;
        }

        const techExists = await prisma.users.findFirst({
          where: { id_user: row.teknisi_user_id, role_id: 4 },
          select: { id_user: true },
        });

        if (!techExists) {
          result.errors.push(
            `${row.incident}: teknisi ID ${row.teknisi_user_id} tidak ditemukan`,
          );
          result.skipped++;
          continue;
        }

        const existing = await prisma.ticket.findUnique({
          where: { INCIDENT: row.incident },
          select: {
            id_ticket: true,
            STATUS_UPDATE: true,
            rca: true,
            sub_rca: true,
            teknisi_user_id: true,
          },
        });

        if (existing) {
          const updateData: any = {
            teknisi_user_id: row.teknisi_user_id,
            JENIS_TIKET: row.jenis_tiket,
            STATUS_UPDATE: row.status_update,
            closed_at: closedAt,
            sync_date: new Date(row.sync_date),
            import_batch: importBatch,
            WORKZONE: row.workzone ?? null,
            CUSTOMER_TYPE: row.customer_type ?? null,
            SUMMARY: row.summary ?? null,
            REPORTED_DATE: row.reported_date ?? null,
            OWNER_GROUP: row.owner_group ?? null,
            SERVICE_NO: row.service_no ?? null,
            CONTACT_NAME: row.contact_name ?? null,
            DESCRIPTION_ACTUAL_SOLUTION:
              row.description_actual_solution ?? null,
            RK_INFORMATION: row.rk_information ?? null,
            SYMPTOM: row.symptom ?? null,
            LAPUL: row.lapul ?? null,
            GAUL: row.gaul ?? null,
            STATUS: 'CLOSED',
            synced_at: new Date(),
          };

          if (!isWorkflowProtected(existing.STATUS_UPDATE)) {
            if (existing.rca) updateData.rca = existing.rca;
            if (existing.sub_rca) updateData.sub_rca = existing.sub_rca;
          }

          await prisma.ticket.update({
            where: { INCIDENT: row.incident },
            data: updateData,
          });
          result.updated++;
        } else {
          await prisma.ticket.create({
            data: {
              INCIDENT: row.incident,
              teknisi_user_id: row.teknisi_user_id,
              JENIS_TIKET: row.jenis_tiket,
              STATUS_UPDATE: row.status_update,
              closed_at: closedAt,
              sync_date: new Date(row.sync_date),
              import_batch: importBatch,
              WORKZONE: row.workzone ?? null,
              CUSTOMER_TYPE: row.customer_type ?? null,
              SUMMARY: row.summary ?? null,
              REPORTED_DATE: row.reported_date ?? null,
              OWNER_GROUP: row.owner_group ?? null,
              SERVICE_NO: row.service_no ?? null,
              CONTACT_NAME: row.contact_name ?? null,
              DESCRIPTION_ACTUAL_SOLUTION:
                row.description_actual_solution ?? null,
              RK_INFORMATION: row.rk_information ?? null,
              SYMPTOM: row.symptom ?? null,
              LAPUL: row.lapul ?? null,
              GAUL: row.gaul ?? null,
              STATUS: 'CLOSED',
            },
          });
          result.inserted++;
        }
      } catch (err) {
        result.errors.push(
          `${row.incident}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
        result.skipped++;
      }
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const body: ImportRequest = await req.json();
    const { rows, import_batch } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Tidak ada data untuk diimport' },
        { status: 400 },
      );
    }

    if (rows.length > 1000) {
      return NextResponse.json(
        { success: false, message: 'Maksimal 1000 baris per import' },
        { status: 400 },
      );
    }

    const { default: prisma } = await import('@/app/libs/prisma');

    const result = await batchUpsert(prisma, rows, import_batch);

    await invalidateTicketsCache();

    return NextResponse.json({
      success: true,
      data: {
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.errors.length,
        errors: result.errors.slice(0, 20),
        total: rows.length,
        import_batch,
      },
    });
  } catch (error: unknown) {
    console.error('Import error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal import data') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
