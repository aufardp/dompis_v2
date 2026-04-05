export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import prisma from '@/app/libs/prisma';

interface RouteParams {
  params: Promise<{ id: string; nodeId: string }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { nodeId } = await params;
    const nodeIdNum = Number(nodeId);

    const node = await prisma.cluster_node.findUnique({
      where: { id: nodeIdNum },
      include: {
        cluster: {
          select: { sa_id: true },
        },
      },
    });

    if (!node) {
      return NextResponse.json(
        {
          success: false,
          message: 'Node not found',
        },
        { status: 404 },
      );
    }

    // Verify admin has access
    const userSa = await prisma.user_sa.findFirst({
      where: {
        user_id: user.id_user,
        sa_id: node.cluster.sa_id,
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

    await ClusterService.removeNode(nodeIdNum);

    return NextResponse.json({
      success: true,
      message: 'Node deleted successfully',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to delete node'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id, nodeId } = await params;
    const clusterId = Number(id);
    const nodeIdNum = Number(nodeId);

    const body = await req.json();
    const { cluster_area_id } = body;

    // Verify admin has access
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { sa_id: true },
    });

    if (!cluster) {
      return NextResponse.json(
        { success: false, message: 'Cluster not found' },
        { status: 404 },
      );
    }

    const userSa = await prisma.user_sa.findFirst({
      where: { user_id: user.id_user, sa_id: cluster.sa_id },
    });

    if (!userSa) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized - Access denied' },
        { status: 403 },
      );
    }

    const node = await prisma.cluster_node.findUnique({
      where: { id: nodeIdNum },
    });

    if (!node || node.cluster_id !== clusterId) {
      return NextResponse.json(
        { success: false, message: 'Node not found in this cluster' },
        { status: 404 },
      );
    }

    const updated = await prisma.cluster_node.update({
      where: { id: nodeIdNum },
      data: { cluster_area_id: cluster_area_id ?? null },
      include: {
        cluster_area: { select: { id: true, nama_area: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        odc_value: updated.odc_value,
        cluster_area_id: updated.cluster_area_id,
        area_name: updated.cluster_area?.nama_area ?? null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to update node area'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
