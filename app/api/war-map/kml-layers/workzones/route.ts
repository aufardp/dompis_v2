export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

const WAR_MAP_ROLES = [
  'admin',
  'helpdesk',
  'superadmin',
  'super_admin',
  'senior_leader',
  'admin_branch',
  'teknisi',
];

export async function GET(req: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-workzones',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(WAR_MAP_ROLES);

    const rows = await prisma.service_area.findMany({
      select: { nama_sa: true },
      distinct: ['nama_sa'],
      orderBy: { nama_sa: 'asc' },
    });

    const workzones = [
      ...new Set(rows.map((r) => (r.nama_sa ?? '').trim()).filter(Boolean)),
    ];

    return NextResponse.json({ success: true, data: workzones });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 500) },
    );
  }
}