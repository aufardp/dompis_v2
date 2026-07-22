import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getOrSetCacheSimple } from '@/lib/cache';

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
      const rows = await getOrSetCacheSimple('workzone:all', async () => {
        const serviceAreas = await prisma.service_area.findMany({
          take: 500,
          select: { id_sa: true, nama_sa: true },
          orderBy: { nama_sa: 'asc' },
          distinct: ['id_sa'],
        });

        return serviceAreas.map((sa) => ({
          value: String(sa.id_sa),
          label: sa.nama_sa,
        }));
      }, 300);

      return NextResponse.json({ success: true, data: rows });
    }

    const rows = await getOrSetCacheSimple(`workzone:${user.role}:${user.id_user}`, async () => {
      const userSas = await prisma.user_sa.findMany({
        take: 500,
        where: { user_id: user.id_user },
        select: {
          sa_id: true,
          service_area: {
            select: { id_sa: true, nama_sa: true },
          },
        },
        distinct: ['sa_id'],
      });

      const result: { value: string; label: string | null }[] = [];
      for (const us of userSas) {
        if (!us.service_area) continue;
        result.push({
          value: String(us.service_area.id_sa),
          label: us.service_area.nama_sa,
        });
      }
      return result;
    }, 300);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
