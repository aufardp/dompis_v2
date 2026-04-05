export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import prisma from '@/app/libs/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    const result = await ClusterService.getDetail(clusterId);

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          message: 'Cluster not found',
        },
        { status: 404 },
      );
    }

    // Verify admin has access to this cluster's SA
    const userSa = await prisma.user_sa.findFirst({
      where: {
        user_id: user.id_user,
        sa_id: result.cluster.sa_id,
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

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch cluster detail'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    const body = await req.json();
    const { nama_cluster, sort_order, is_active } = body;

    // Verify admin has access to this cluster's SA
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

    const updated = await ClusterService.update(
      clusterId,
      {
        nama_cluster,
        sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
        is_active,
      },
      user.id_user,
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to update cluster'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    // Verify admin has access to this cluster's SA
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

    await ClusterService.delete(clusterId);

    return NextResponse.json({
      success: true,
      message: 'Cluster deleted successfully',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to delete cluster'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
