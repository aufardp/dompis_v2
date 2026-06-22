export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import {
  getProjectionReconciliationReport,
  runProjection,
} from '@/lib/projection';
import { logger } from '@/lib/observability/logger';

type RecoverProjectionBody = {
  syncBatchId?: string;
  since?: string;
  forceAll?: boolean;
  skipAutoRepair?: boolean;
};

function parseSince(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET() {
  try {
    await protectApi(['admin', 'superadmin']);
    const report = await getProjectionReconciliationReport();

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        oldestUnprojectedImportedAt: report.oldestUnprojectedImportedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal mengambil status recovery projection'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin']);

    const body = (await req.json().catch(() => ({}))) as RecoverProjectionBody;
    const syncBatchId = body.syncBatchId?.trim() || null;
    const since = parseSince(body.since);
    const skipAutoRepair = body.skipAutoRepair ?? true;

    let target: {
      mode: 'batch' | 'full';
      syncBatchId?: string;
      since?: Date;
      label: string;
    } | null = null;

    if (syncBatchId) {
      target = {
        mode: 'batch',
        syncBatchId,
        label: `syncBatchId=${syncBatchId}`,
      };
    } else if (since) {
      target = {
        mode: 'batch',
        since,
        label: `since=${since.toISOString()}`,
      };
    } else {
      const report = await getProjectionReconciliationReport();
      if (report.neverProjectedRaw > 0 && report.oldestUnprojectedImportedAt) {
        target = {
          mode: 'batch',
          since: report.oldestUnprojectedImportedAt,
          label: `oldestPending=${report.oldestUnprojectedImportedAt.toISOString()}`,
        };
      } else if (body.forceAll) {
        target = {
          mode: 'full',
          since: new Date(0),
          label: 'full replay from epoch',
        };
      }
    }

    if (!target) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Tidak ada backlog projection yang tertinggal. Kirim syncBatchId, since, atau forceAll=true untuk replay penuh.',
        },
        { status: 409 },
      );
    }

    logger.info('[ProjectionRecover] Starting recovery projection', target);
    const result = await runProjection(undefined, {
      mode: target.mode,
      syncBatchId: target.syncBatchId,
      since: target.since,
      preserveCheckpointCursor: true,
      skipAutoRepair,
    });

    const reconciliation = await getProjectionReconciliationReport();

    return NextResponse.json({
      success: true,
      message: 'Recovery projection completed',
      target: target.label,
      result,
      reconciliation: {
        ...reconciliation,
        oldestUnprojectedImportedAt:
          reconciliation.oldestUnprojectedImportedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    logger.error('[ProjectionRecover] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Recovery projection gagal'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
