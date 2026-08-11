export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

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
      namespace: 'war-map-kml-list',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(WAR_MAP_ROLES);

    const isRootRole = ['admin', 'superadmin', 'super_admin'].includes(user.role);
    const isSuperAdmin = user.role === 'superadmin' || user.role === 'super_admin';

    const where: Prisma.kml_layerWhereInput = { status: 'active' };
    if (!isSuperAdmin) {
      const workzones = await getWorkzonesForUser(user.id_user);
      if (workzones.length === 0) {
        return NextResponse.json({
          success: true,
          data: { layers: [], canManage: isRootRole },
        });
      }
      where.workzone_tag = { in: workzones, not: null };
    }

    const layers = await prisma.kml_layer.findMany({
      where,
      orderBy: { uploaded_at: 'desc' },
      select: {
        id: true,
        title: true,
        original_filename: true,
        workzone_tag: true,
        point_count: true,
        line_count: true,
        bbox_south: true,
        bbox_west: true,
        bbox_north: true,
        bbox_east: true,
        uploaded_at: true,
        uploaded_by: true,
        uploader: { select: { nama: true } },
        sublayers: {
          orderBy: { display_order: 'asc' },
          select: {
            id: true,
            folder_path: true,
            geometry_kind: true,
            feature_count: true,
            default_visible: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        layers: layers.map((l) => ({
          id: l.id,
          title: l.title,
          originalFilename: l.original_filename,
          workzoneTag: l.workzone_tag,
          pointCount: l.point_count,
          lineCount: l.line_count,
          bbox: l.bbox_south !== null
            ? {
                south: l.bbox_south.toNumber(),
                west: l.bbox_west!.toNumber(),
                north: l.bbox_north!.toNumber(),
                east: l.bbox_east!.toNumber(),
              }
            : null,
          uploadedAt: l.uploaded_at,
          uploadedBy: l.uploader?.nama ?? null,
          sublayers: l.sublayers.map((s) => ({
            id: s.id,
            folderPath: s.folder_path,
            geometryKind: s.geometry_kind,
            featureCount: s.feature_count,
            defaultVisible: s.default_visible,
          })),
        })),
        canManage: isRootRole,
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
