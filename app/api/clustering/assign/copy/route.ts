export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import prisma from '@/app/libs/prisma';

export async function POST(req: Request) {
  const lockKey = 'cluster-copy-lock';
  const ownerId = `copy-${Date.now()}-${Math.random()}`;

  const lockAcquired = await acquireLock(lockKey, ownerId, 30);

  if (!lockAcquired) {
    return NextResponse.json(
      {
        success: false,
        message: 'Proses copy sedang berjalan. Silakan coba lagi.',
      },
      { status: 409 },
    );
  }

  try {
    const user = await protectApi(['admin', 'superadmin']);

    const body = await req.json();
    const { from_date, to_date, sa_id } = body;

    if (!from_date || !to_date) {
      return NextResponse.json(
        {
          success: false,
          message: 'from_date and to_date are required',
        },
        { status: 400 },
      );
    }

    const targetSaId = sa_id !== undefined ? Number(sa_id) : undefined;

    // If sa_id not provided, get user's managed SAs
    let saIds: number[];
    if (targetSaId) {
      // Verify admin has access to this SA
      const userSa = await prisma.user_sa.findFirst({
        where: {
          user_id: user.id_user,
          sa_id: targetSaId,
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
      saIds = [targetSaId];
    } else {
      const userSas = await prisma.user_sa.findMany({
        where: { user_id: user.id_user },
        select: { sa_id: true },
      });

      if (userSas.length === 0) {
        return NextResponse.json({
          success: true,
          data: { copied: 0, skipped: 0 },
        });
      }

      saIds = userSas.map((us: { sa_id: number | null }) => us.sa_id).filter((id: number | null): id is number => id !== null);
    }

    const result = await ClusterService.copyFromDate(
      String(from_date),
      String(to_date),
      saIds[0], // Use first SA ID
      user.id_user,
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to copy assignments'),
      },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    await releaseLock(lockKey, ownerId);
  }
}
