export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET(req: NextRequest) {
  try {
    await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(req.url);
    const techId = Number(searchParams.get('tech_id'));
    const month = Number(searchParams.get('month'));
    const year = Number(searchParams.get('year'));

    if (!techId || !month || !year) {
      return NextResponse.json(
        { success: false, message: 'Parameter tidak lengkap' },
        { status: 400 },
      );
    }

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0, 0);

    const tickets = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: techId,
        status_update: { in: ['close', 'closed'] },
        closed_at: { gte: start, lt: end },
      },
      select: {
        id_ticket: true,
        incident: true,
        contact_name: true,
        service_no: true,
        customer_type: true,
        jenis_tiket_2: true,
        workzone: true,
        reported_date: true,
        closed_at: true,
        description_solution_dompis: true,
        rca: true,
        sub_rca: true,
      },
      orderBy: { closed_at: 'desc' },
    });

    const mapped = tickets.map((t) => {
      const reported = t.reported_date
        ? new Date(t.reported_date)
        : null;
      const closed = t.closed_at;
      const resolveHours =
        reported && closed
          ? ((closed.getTime() - reported.getTime()) / 3600000).toFixed(1)
          : null;

      return {
        idTicket: t.id_ticket,
        incident: t.incident,
        contactName: t.contact_name,
        serviceNo: t.service_no,
        customerType: t.customer_type,
        jenisTiket: t.jenis_tiket_2,
        workzone: t.workzone,
        reportedDate: t.reported_date,
        closedAt: closed ? closed.toISOString() : null,
        resolveHours,
        rca: t.rca,
        subRca: t.sub_rca,
        descriptionSolutionDompis: t.description_solution_dompis,
      };
    });

    return NextResponse.json({
      success: true,
      data: { tickets: mapped, total: mapped.length },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal mengambil data tiket'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
