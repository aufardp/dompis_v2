import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { resolveBranchScope } from '@/app/helpers/ticket.helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);
    const branchParam =
      searchParams.get('branchId') ?? searchParams.get('branch');

    const branchSas = await resolveBranchScope(
      user.role,
      user.id_user,
      branchParam,
    );

    if (branchSas && branchSas.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const branchSaNames = branchSas ? new Set(branchSas) : null;

    if (user.role === 'super_admin' || user.role === 'superadmin') {
      const serviceAreas = await prisma.service_area.findMany({
        take: 500,
        select: { id_sa: true, nama_sa: true },
        orderBy: { nama_sa: 'asc' },
        distinct: ['id_sa'],
      });

      const rows = serviceAreas
        .filter(
          (sa) => !branchSaNames || (sa.nama_sa && branchSaNames.has(sa.nama_sa)),
        )
        .map((sa) => ({ value: String(sa.id_sa), label: sa.nama_sa }));

      return NextResponse.json({ success: true, data: rows });
    }

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

    const rows: { value: string; label: string | null }[] = [];
    for (const us of userSas) {
      if (!us.service_area) continue;
      if (
        branchSaNames &&
        (!us.service_area.nama_sa || !branchSaNames.has(us.service_area.nama_sa))
      ) {
        continue;
      }
      rows.push({
        value: String(us.service_area.id_sa),
        label: us.service_area.nama_sa,
      });
    }

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}