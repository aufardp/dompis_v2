export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterAutoAssignServiceV2 } from '@/app/libs/services/clusterAutoAssign.service';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import {
  broadcastAutoAssignProgress,
  broadcastAutoAssignCompleted,
  broadcastAutoAssignError,
} from '@/app/libs/autoAssignSSE';
import { autoAssignLogger } from '@/app/libs/autoAssignLogger';
import prisma from '@/app/libs/prisma';

const LOCK_TTL = 600;

export async function POST(req: Request) {
  const acceptHeader = req.headers.get('accept') || '';
  const wantsSSE = acceptHeader.includes('text/event-stream');

  const lockKey = 'auto-assign-lock';
  const ownerId = `autoassign-${Date.now()}`;

  const lockAcquired = await acquireLock(lockKey, ownerId, LOCK_TTL);

  if (!lockAcquired) {
    if (wantsSSE) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Proses auto-assign sedang berjalan' })}\n\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }
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

    const userSAs = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      select: { sa_id: true },
    });

    if (userSAs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Anda tidak memiliki workzone yang di-assign. Hubungi admin.',
        },
        { status: 400 },
      );
    }

    const saIds = userSAs
      .map((usa) => usa.sa_id)
      .filter((id): id is number => id !== null);
    console.log('[AUTO-ASSIGN API] User workzones:', saIds);

    ClusterAutoAssignServiceV2.setProgressCallback((data) => {
      if (data.type === 'completed') {
        broadcastAutoAssignCompleted({
          total: data.total,
          assigned: data.assigned,
          failed: data.failed,
          skipped: data.total - data.assigned - data.failed,
        });
      } else if (data.type === 'error') {
        broadcastAutoAssignError(data.message || 'Unknown error');
      } else {
        broadcastAutoAssignProgress(data);
      }
    });

    if (wantsSSE) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'started', message: 'Auto-assign started' })}\n\n`,
            ),
          );
        },
        cancel() {
          autoAssignLogger.info('sse_connection_closed_by_client');
        },
      });

      const result = await ClusterAutoAssignServiceV2.runBatchV2(
        saIds,
        user.id_user,
      );

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const result = await ClusterAutoAssignServiceV2.runBatchV2(
      saIds,
      user.id_user,
    );

    return NextResponse.json({
      success: true,
      data: {
        total: result.total,
        assigned: result.assigned,
        failed: result.failed,
        skipped: result.skipped,
        message:
          result.assigned === result.total
            ? `${result.assigned} tiket berhasil di-assign`
            : `${result.assigned} dari ${result.total} tiket berhasil di-assign. ${result.failed} gagal.`,
      },
    });
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error, 'Failed to run auto-assign');
    autoAssignLogger.error('batch_failed', { error: errorMsg });
    broadcastAutoAssignError(errorMsg);

    return NextResponse.json(
      {
        success: false,
        message: errorMsg,
      },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    await releaseLock(lockKey, ownerId);
    ClusterAutoAssignServiceV2.setProgressCallback(null);
  }
}
