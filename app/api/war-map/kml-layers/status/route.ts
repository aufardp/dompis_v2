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
];

export async function GET(req: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-status',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(WAR_MAP_ROLES);

    const layerId = Number(req.nextUrl.searchParams.get('layerId'));
    if (!Number.isFinite(layerId) || layerId <= 0) {
      return NextResponse.json({ success: true, data: null });
    }

    const layer = await prisma.kml_layer.findUnique({
      where: { id: layerId },
      select: {
        id: true,
        title: true,
        point_count: true,
        line_count: true,
        uploaded_at: true,
      },
    });

    if (!layer) {
      return NextResponse.json({ success: true, data: null });
    }

    const featureCount = await prisma.kml_feature.count({
      where: { kml_layer_id: layerId },
    });

    const expected = layer.point_count + layer.line_count;
    const complete = featureCount >= expected;

    return NextResponse.json({
      success: true,
      data: {
        layer_id: layer.id,
        title: layer.title,
        status: complete ? 'done' : 'running',
        feature_count: featureCount,
        expected_count: expected,
        uploaded_at: layer.uploaded_at,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 500) },
    );
  }
}
