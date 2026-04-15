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
        STATUS_UPDATE: { in: ['close', 'closed'] },
        closed_at: { gte: start, lt: end },
      },
      select: {
        id_ticket: true,
        INCIDENT: true,
        CONTACT_NAME: true,
        SERVICE_NO: true,
        CUSTOMER_TYPE: true,
        JENIS_TIKET: true,
        WORKZONE: true,
        REPORTED_DATE: true,
        closed_at: true,
        DESCRIPTION_ACTUAL_SOLUTION: true,
        rca: true,
        sub_rca: true,
      },
      orderBy: { closed_at: 'desc' },
    });

    const mapped = tickets.map((t) => {
      const reported = t.REPORTED_DATE
        ? new Date(t.REPORTED_DATE)
        : null;
      const closed = t.closed_at;
      const resolveHours =
        reported && closed
          ? ((closed.getTime() - reported.getTime()) / 3600000).toFixed(1)
          : null;

      return {
        idTicket: t.id_ticket,
        incident: t.INCIDENT,
        contactName: t.CONTACT_NAME,
        serviceNo: t.SERVICE_NO,
        customerType: t.CUSTOMER_TYPE,
        jenisTiket: t.JENIS_TIKET,
        workzone: t.WORKZONE,
        reportedDate: t.REPORTED_DATE,
        closedAt: closed ? closed.toISOString() : null,
        resolveHours,
        rca: t.rca,
        subRca: t.sub_rca,
        descriptionActualSolution: t.DESCRIPTION_ACTUAL_SOLUTION,
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
