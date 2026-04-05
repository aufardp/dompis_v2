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

    const areas = await prisma.cluster_area.findMany({
      where: { cluster_id: clusterId },
      orderBy: { sort_order: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: areas.map((a: { id: number; cluster_id: number; nama_area: string; sort_order: number }) => ({
        id: a.id,
        cluster_id: a.cluster_id,
        nama_area: a.nama_area,
        sort_order: a.sort_order,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch areas'),
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

    const area = await ClusterService.addArea(
      clusterId,
      String(nama_area),
      sort_order !== undefined ? Number(sort_order) : 0,
    );

    return NextResponse.json({ success: true, data: area });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to add area'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
