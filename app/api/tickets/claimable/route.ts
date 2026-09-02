export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import prisma from '@/app/libs/prisma';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-claimable',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);
    const { searchParams } = new URL(req.url);
    const workzoneFilter = searchParams.get('workzone');
    const take = Math.min(100, Math.max(10, parseInt(searchParams.get('take') || '50', 10) || 50));

    const userSas = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      include: { service_area: { select: { nama_sa: true } } },
      take: 50,
    });
    const allowedWz = userSas.map((usa) => usa.service_area?.nama_sa).filter(Boolean) as string[];
    if (!allowedWz.length) {
      return NextResponse.json({ success: true, data: [], message: 'Tidak ada workzone' });
    }

    const where: Record<string, unknown> = {
      teknisi_user_id: null,
      OR: [{ status_update: null }, { status_update: 'open' }],
      workzone: workzoneFilter ? workzoneFilter : { in: allowedWz },
    };

    const rows = await prisma.ticket.findMany({
      where: where as never,
      orderBy: { jam_expired: 'asc' },
      take,
      select: {
        id_ticket: true,
        incident: true,
        workzone: true,
        service_no: true,
        alamat: true,
        summary: true,
        jam_expired: true,
        flagging_manja: true,
        jenis_tiket_2: true,
        customer_segment: true,
        rk_information: true,
        status_update: true,
      },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to fetch claimable tickets') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
