export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import prisma from '@/app/libs/prisma';

// GET /api/clustering/assign?date=2026-04-03&sa_id=1
export async function GET(req: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin']);

    const url = new URL(req.url);
    const date =
      url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const saIdParam = url.searchParams.get('sa_id');

    // Get user's managed SAs
    const userSas = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      select: { sa_id: true },
    });

    if (userSas.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const saIds = saIdParam
      ? [Number(saIdParam)]
      : userSas.map((us) => us.sa_id).filter((id): id is number => id !== null);

    // Get clusters for the SA(s)
    const clusters = await prisma.cluster.findMany({
      where: {
        sa_id: { in: saIds },
        is_active: true,
      },
      select: {
        id: true,
        nama_cluster: true,
      },
    });

    const clusterIds = clusters.map((c) => c.id);

    // Get assignments for the date
    const assignments = await prisma.cluster_assignment.findMany({
      where: {
        cluster_id: { in: clusterIds },
        assigned_date: date,
        is_active: true,
      },
      include: {
        teknisi: {
          select: {
            id_user: true,
            nama: true,
            nik: true,
          },
        },
        cluster: {
          select: {
            id: true,
            nama_cluster: true,
          },
        },
      },
      orderBy: [
        { cluster: { nama_cluster: 'asc' } },
        { teknisi: { nama: 'asc' } },
      ],
    });

    // Group by cluster
    const result = clusters.map((c) => ({
      cluster_id: c.id,
      cluster_name: c.nama_cluster,
      assignments: assignments
        .filter((a) => a.cluster_id === c.id)
        .map((a) => ({
          id: a.id,
          teknisi_id: a.teknisi_id,
          teknisi_nama: a.teknisi.nama,
          teknisi_nik: a.teknisi.nik,
          assigned_date: a.assigned_date,
          note: a.note,
        })),
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch assignments'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function POST(req: Request) {
  const lockKey = 'cluster-assign-lock';
  const ownerId = `assign-${Date.now()}-${Math.random()}`;

  const lockAcquired = await acquireLock(lockKey, ownerId, 30);

  if (!lockAcquired) {
    return NextResponse.json(
      {
        success: false,
        message: 'Proses assignment sedang berjalan. Silakan coba lagi.',
      },
      { status: 409 },
    );
  }

  try {
    const user = await protectApi(['admin', 'superadmin']);

    const body = await req.json();
    const { cluster_id, teknisi_id, teknisi_ids, assigned_date, note } = body;

    if (!cluster_id || !assigned_date) {
      return NextResponse.json(
        {
          success: false,
          message: 'cluster_id and assigned_date are required',
        },
        { status: 400 },
      );
    }

    // Support both single teknisi_id and multiple teknisi_ids
    const teknisiIdList: number[] = teknisi_ids
      ? Array.isArray(teknisi_ids)
        ? teknisi_ids
        : [teknisi_ids]
      : teknisi_id
        ? [teknisi_id]
        : [];

    if (teknisiIdList.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'teknisi_id or teknisi_ids is required',
        },
        { status: 400 },
      );
    }

    // Verify admin has access to this cluster's SA
    const cluster = await prisma.cluster.findUnique({
      where: { id: Number(cluster_id) },
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

    let created = 0;
    let skipped = 0;

    for (const tid of teknisiIdList) {
      try {
        await ClusterService.plotTeknisi(
          Number(cluster_id),
          Number(tid),
          String(assigned_date),
          user.id_user,
          note,
        );
        created++;
      } catch (err: any) {
        // If conflict (already exists), skip silently
        if (err?.status === 409) {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to plot teknisi'),
      },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    await releaseLock(lockKey, ownerId);
  }
}
