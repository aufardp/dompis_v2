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

    // Verify admin has access
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

    const nodes = await prisma.cluster_node.findMany({
      where: { cluster_id: clusterId },
      include: {
        cluster_area: {
          select: { nama_area: true },
        },
      },
      orderBy: [{ sort_order: 'asc' }, { odc_value: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      data: nodes.map((n: {
        id: number;
        cluster_id: number;
        cluster_area_id: number | null;
        odc_value: string | null;
        is_active: boolean;
        sort_order: number;
        created_at: Date;
        cluster_area?: { nama_area: string } | null;
      }) => ({
        id: n.id,
        cluster_id: n.cluster_id,
        cluster_area_id: n.cluster_area_id,
        odc_value: n.odc_value,
        is_active: n.is_active,
        sort_order: n.sort_order,
        created_at: n.created_at.toISOString(),
        area_name: n.cluster_area?.nama_area,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch nodes'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    const body = await req.json();
    const { odc_value, cluster_area_id, sort_order } = body;

    if (!odc_value) {
      return NextResponse.json(
        {
          success: false,
          message: 'odc_value is required',
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

    const node = await ClusterService.addNode(
      clusterId,
      String(odc_value),
      cluster_area_id !== undefined ? Number(cluster_area_id) : undefined,
      sort_order !== undefined ? Number(sort_order) : 0,
    );

    return NextResponse.json({ success: true, data: node });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to add node'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
