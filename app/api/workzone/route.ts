import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    if (user.role === 'super_admin' || user.role === 'superadmin') {
      const serviceAreas = await prisma.service_area.findMany({
        orderBy: { nama_sa: 'asc' },
      });

      const rows = serviceAreas.map((sa) => ({
        value: String(sa.id_sa),
        label: sa.nama_sa,
      }));

      return NextResponse.json({ success: true, data: rows });
    }

    const userSas = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      include: { service_area: true },
    });

    const rows = userSas
      .filter((us) => us.service_area)
      .map((us) => ({
        value: String(us.service_area!.id_sa),
        label: us.service_area!.nama_sa,
      }));

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
