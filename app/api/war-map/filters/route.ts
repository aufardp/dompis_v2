import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT_ROLES = ['superadmin', 'super_admin'];

export async function GET(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-filters',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'senior_leader',
      'admin_branch',
    ]);

    const isRootRole = ROOT_ROLES.includes(user.role);

    let userSas;
    if (isRootRole) {
      const all = await prisma.service_area.findMany({
        where: { nama_sa: { not: '' } },
        select: { nama_sa: true, area: { select: { nama_area: true } } },
        take: 500,
      });
      userSas = all.map((s) => ({ nama_sa: s.nama_sa, nama_area: s.area?.nama_area }));
    } else {
      const rows = await prisma.user_sa.findMany({
        where: { user_id: user.id_user },
        select: {
          service_area: {
            select: { nama_sa: true, area: { select: { nama_area: true } } },
          },
        },
        take: 500,
      });
      userSas = rows
        .map((r) => ({
          nama_sa: r.service_area?.nama_sa ?? null,
          nama_area: r.service_area?.area?.nama_area ?? null,
        }))
        .filter(
          (r): r is { nama_sa: string; nama_area: string | null } =>
            Boolean(r.nama_sa && r.nama_sa.trim() !== ''),
        );
    }

    const workzoneSet = [...new Set(
      userSas
        .map((s) => s?.nama_sa)
        .filter((nama): nama is string => Boolean(nama && nama.trim())),
    )];

    const areaSet = [...new Set(
      userSas
        .map((s) => s?.nama_area)
        .filter((nama): nama is string => Boolean(nama && nama.trim())),
    )];

    const workzoneOptions = workzoneSet.map((nama) => ({ value: nama, label: nama }));
    const areaOptions = areaSet.map((nama) => ({ value: nama, label: nama }));

    return NextResponse.json({
      success: true,
      data: { workzones: workzoneOptions, areas: areaOptions },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 500) },
    );
  }
}