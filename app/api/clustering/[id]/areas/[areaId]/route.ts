export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import prisma from '@/app/libs/prisma';

interface RouteParams {
  params: Promise<{ id: string; areaId: string }>;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id, areaId } = await params;
    const clusterId = Number(id);
    const areaIdNum = Number(areaId);

    const body = await req.json();
    const { nama_area, sort_order } = body;

    if (!nama_area) {
      return NextResponse.json(
        {
          success: false,
          message: 'nama_area is required',
        },
        { status: 400 },
      );
    }

    // Verify admin has access
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { sa_id: true },
    });

    if (!cluster) {
      return NextResponse.json(
        {
          success: false,
          message: 'Cluster not found',
        },
        { status: 404 },
      );
    }

    const userSa = await prisma.user_sa.findFirst({
      where: {
        user_id: user.id_user,
        sa_id: cluster.sa_id,
      },
    });

    if (!userSa) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized - Access denied',
        },
        { status: 403 },
      );
    }

    const area = await ClusterService.updateArea(
      areaIdNum,
      String(nama_area),
      sort_order !== undefined ? Number(sort_order) : undefined,
    );

    return NextResponse.json({ success: true, data: area });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to update area'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { areaId } = await params;
    const areaIdNum = Number(areaId);

    const area = await prisma.cluster_area.findUnique({
      where: { id: areaIdNum },
      include: {
        cluster: {
          select: { sa_id: true },
        },
      },
    });

    if (!area) {
      return NextResponse.json(
        {
          success: false,
          message: 'Area not found',
        },
        { status: 404 },
      );
    }

    // Verify admin has access
    const userSa = await prisma.user_sa.findFirst({
      where: {
        user_id: user.id_user,
        sa_id: area.cluster.sa_id,
      },
    });

    if (!userSa) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized - Access denied',
        },
        { status: 403 },
      );
    }

    await ClusterService.deleteArea(areaIdNum);

    return NextResponse.json({
      success: true,
      message: 'Area deleted successfully',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to delete area'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
