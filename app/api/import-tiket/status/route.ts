export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

const CHECKPOINT_NAME = 'ticket_raw_to_ticket';

function resolveProjectionStatus(params: {
  projectionEnabled: boolean;
  requestProcessedAt: Date | null;
  checkpointStatus: string | null;
}): 'queued' | 'running' | 'done' | 'failed' | 'aborted' | 'disabled' {
  if (!params.projectionEnabled) return 'disabled';

  if (params.checkpointStatus === 'running') return 'running';
  if (params.checkpointStatus === 'failed') return 'failed';
  if (params.checkpointStatus === 'aborted') return 'aborted';

  if (params.requestProcessedAt || params.checkpointStatus === 'success') {
    return 'done';
  }

  return 'queued';
}

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const batch = req.nextUrl.searchParams.get('batch')?.trim() ?? '';
    if (!batch) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    const projectionEnabled = process.env.PROJECTION_ENABLED === 'true';
    const [projectionRequest, checkpoint, rowCount] = await Promise.all([
      prisma.projection_request.findFirst({
        where: {
          source: 'import-tiket',
          syncBatchId: batch,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          processedAt: true,
        },
      }),
      prisma.ticket_projection_checkpoint.findUnique({
        where: { name: CHECKPOINT_NAME },
        select: {
          status: true,
          lastSyncBatchId: true,
        },
      }),
      prisma.ticket_raw.count({
        where: { syncBatchId: batch },
      }),
    ]);

    const projectionStatus = resolveProjectionStatus({
      projectionEnabled,
      requestProcessedAt: projectionRequest?.processedAt ?? null,
      checkpointStatus: checkpoint?.status ?? null,
    });

    return NextResponse.json({
      success: true,
      data: {
        import_batch: batch,
        requested_at: projectionRequest?.createdAt?.toISOString() ?? null,
        projected_at: projectionRequest?.processedAt?.toISOString() ?? null,
        projection_status: projectionStatus,
        checkpoint_status: checkpoint?.status ?? null,
        last_checkpoint_batch: checkpoint?.lastSyncBatchId ?? null,
        projection_enabled: projectionEnabled,
        row_count: rowCount,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal mengambil status import'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
