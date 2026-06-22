export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import prisma from '@/app/libs/prisma';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

const createClusterSchema = z.object({
  sa_id: z.coerce.number({ message: 'sa_id is required and must be a number' }),
  nama_cluster: z.string().min(1, 'nama_cluster is required'),
  sort_order: z.coerce.number().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin']);

    // Get user's managed SAs
    const userSas = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      select: { sa_id: true },
      take: 100,
    });

    if (userSas.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const saIds = userSas
      .map((us: { sa_id: number | null }) => us.sa_id)
      .filter((id: number | null): id is number => id !== null);

    // Get clusters for all SAs this admin manages
    const allClusters = await prisma.cluster.findMany({
      where: {
        sa_id: { in: saIds },
        is_active: true,
      },
      take: 500,
      include: {
        areas: {
          orderBy: { sort_order: 'asc' },
        },
        nodes: {
          where: { is_active: true },
          select: { id: true },
        },
        assignments: {
          where: {
            is_active: true,
            assigned_date: AttendanceService.getTodayDateString(),
          },
          include: {
            teknisi: {
              select: {
                id_user: true,
                nama: true,
                nik: true,
              },
            },
          },
        },
      },
      orderBy: [{ sort_order: 'asc' }, { nama_cluster: 'asc' }],
    });

    const clusters = allClusters.map((c: {
      id: number;
      sa_id: number;
      nama_cluster: string;
      is_active: boolean;
      sort_order: number;
      created_by: number | null;
      created_at: Date;
      updated_at: Date;
      nodes: Array<{ id: number }>;
      areas: Array<{ nama_area: string }>;
      assignments: Array<{ teknisi: { id_user: number; nama: string | null; nik: string | null } }>;
    }) => ({
      id: c.id,
      sa_id: c.sa_id,
      nama_cluster: c.nama_cluster,
      is_active: c.is_active,
      sort_order: c.sort_order,
      created_by: c.created_by,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
      node_count: c.nodes.length,
      area_names: c.areas.map((a) => a.nama_area),
      teknisi_today: c.assignments.map((a) => ({
        id_user: a.teknisi.id_user,
        nama: a.teknisi.nama,
        nik: a.teknisi.nik,
      })),
    }));

    return NextResponse.json({ success: true, data: clusters });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch clusters'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'clustering-create',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json();

    const parsed = createClusterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }

    const { sa_id, nama_cluster, sort_order } = parsed.data;

    // Verify admin has access to this SA (skip for superadmin)
    if (user.role !== 'superadmin') {
      const userSa = await prisma.user_sa.findFirst({
        where: {
          user_id: user.id_user,
          sa_id: sa_id,
        },
      });

      if (!userSa) {
        return NextResponse.json(
          {
            success: false,
            message: 'Unauthorized - You do not manage this service area',
          },
          { status: 403 },
        );
      }
    }

    const cluster = await ClusterService.create(
      {
        sa_id,
        nama_cluster,
        sort_order: sort_order ?? 0,
      },
      user.id_user,
    );

    return NextResponse.json({ success: true, data: cluster });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to create cluster'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
