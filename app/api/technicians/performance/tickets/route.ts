export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import {
  classifyRecapColumn,
  resolveHoursFrom,
  RECAP_BUCKET_KEYS,
  type RecapCountKey,
} from '@/app/libs/services/recap-close.service';

const WIB_OFFSET = '+07:00';

function parseWibDate(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00${WIB_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const { searchParams } = new URL(req.url);
    const techId = Number(searchParams.get('tech_id'));
    const dateFrom = parseWibDate(searchParams.get('date_from'));
    const dateToRaw = parseWibDate(searchParams.get('date_to'));
    const bucketParam = (searchParams.get('bucket') ?? '').toUpperCase();
    const serviceArea = searchParams.get('service_area')?.trim() || undefined;

    if (!techId || !dateFrom || !dateToRaw) {
      return NextResponse.json(
        { success: false, message: 'Parameter tidak lengkap' },
        { status: 400 },
      );
    }
    const dateTo = new Date(dateToRaw.getTime() + 24 * 60 * 60 * 1000);

    const wantBucket: RecapCountKey | null =
      bucketParam === 'LAIN'
        ? 'LAIN'
        : (RECAP_BUCKET_KEYS as readonly string[]).includes(bucketParam)
          ? (bucketParam as RecapCountKey)
          : null;

    const wzClause = serviceArea
      ? Prisma.sql`AND LOWER(t.workzone) = LOWER(${serviceArea})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<
      Array<{
        id_ticket: number;
        incident: string;
        contact_name: string | null;
        service_no: string | null;
        customer_type: string | null;
        jenis_tiket_1: string | null;
        jenis_tiket_2: string | null;
        workzone: string | null;
        reported_date: string | null;
        closed_at: Date | null;
        resolve_date: Date | null;
        description_solution_dompis: string | null;
        rca: string | null;
        sub_rca: string | null;
        is_manual: number | boolean | null;
        source_ticket: string | null;
        classification_flag: string | null;
        classification_path: string | null;
        channel: string | null;
        summary: string | null;
        sqm_update_reason: string | null;
      }>
    >(Prisma.sql`
      SELECT t.id_ticket, t.incident, t.contact_name, t.service_no, t.customer_type,
             t.jenis_tiket_1, t.jenis_tiket_2, t.workzone, t.reported_date, t.closed_at,
             t.resolve_date,
             t.description_solution_dompis, t.rca, t.sub_rca, t.is_manual,
             t.source_ticket, t.classification_flag, t.classification_path,
             t.channel, t.summary, t.sqm_update_reason
      FROM ticket t
      WHERE t.teknisi_user_id = ${techId}
        AND UPPER(t.status) = 'CLOSED'
        AND LOWER(t.status_update) = 'close'
        AND t.closed_at >= ${dateFrom} AND t.closed_at < ${dateTo}
        ${wzClause}
      ORDER BY t.closed_at DESC
      LIMIT 2000
    `);

    const mapped = rows
      .map((t) => ({
        column: classifyRecapColumn(t),
        idTicket: t.id_ticket,
        incident: t.incident,
        contactName: t.contact_name,
        serviceNo: t.service_no,
        customerType: t.customer_type,
        jenisTiket: t.jenis_tiket_2 ?? t.jenis_tiket_1,
        workzone: t.workzone,
        reportedDate: t.reported_date,
        closedAt: t.closed_at ? t.closed_at.toISOString() : null,
        // Resolve = reported_date → resolve_date (Nossa). reported_date VARCHAR bebas → klamp.
        resolveHours: resolveHoursFrom(t.reported_date, t.resolve_date),
        rca: t.rca,
        subRca: t.sub_rca,
        descriptionSolutionDompis: t.description_solution_dompis,
      }))
      .filter((t) => !wantBucket || t.column === wantBucket);

    return NextResponse.json({
      success: true,
      data: { tickets: mapped, total: mapped.length },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal mengambil data tiket') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
