export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterAutoAssignService } from '@/app/libs/services/clusterAutoAssign.service';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import prisma from '@/app/libs/prisma';

export async function POST(req: Request) {
  const lockKey = 'auto-assign-lock';
  const ownerId = `autoassign-${Date.now()}`;

  const lockAcquired = await acquireLock(lockKey, ownerId, 30);

  if (!lockAcquired) {
    return NextResponse.json(
      {
        success: false,
        message: 'Proses auto-assign sedang berjalan. Silakan tunggu.',
      },
      { status: 409 },
    );
  }

  try {
    const user = await protectApi(['admin', 'superadmin']);

    const body = await req.json();
    const saId = body.sa_id !== undefined ? Number(body.sa_id) : undefined;

    // If sa_id provided, verify admin has access
    if (saId) {
      const userSa = await prisma.user_sa.findFirst({
        where: {
          user_id: user.id_user,
          sa_id: saId,
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
    }

    // Run batch auto-assign
    const result = await ClusterAutoAssignService.runBatch(saId);

    const noTeknisiCount = result.results.filter(
      (r) => r.reason === 'no_teknisi_today',
    ).length;
    const noClusterCount = result.results.filter(
      (r) => r.reason === 'no_cluster',
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        total: result.total,
        assigned: result.assigned,
        failed: result.failed,
        skipped: result.skipped,
        no_teknisi: noTeknisiCount,
        no_cluster: noClusterCount,
        message:
          result.assigned === result.total
            ? `${result.assigned} tiket berhasil di-assign`
            : `${result.assigned} dari ${result.total} tiket berhasil di-assign. ${noTeknisiCount} gagal: tidak ada teknisi.`,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to run auto-assign'),
      },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    await releaseLock(lockKey, ownerId);
  }
}
