export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { getProjectionHealth } from '@/lib/sync-metrics/metrics';
import { logger } from '@/lib/observability/logger';

const STATUS_CACHE_TTL_MS = 15_000;
let lastSyncError: string | null = null;
let cachedStatusResponse:
  | {
      payload: Record<string, unknown>;
      expiresAt: number;
    }
  | null = null;

const CHECKPOINT_NAME = 'ticket_raw_to_ticket';

function isConnectionPoolError(error: any): boolean {
  return (
    error?.code === 'P2024' ||
    error?.message?.includes('Timed out fetching a new connection from the connection pool')
  );
}

function isConnectionLostError(error: any): boolean {
  return (
    error?.code === 'P1017' ||
    error?.message?.includes('Server has closed the connection')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildStatusResponse(
  checkpoint: Awaited<
    ReturnType<typeof prisma.ticket_projection_checkpoint.findUnique>
  >,
  options: { degraded?: boolean; source?: 'database' | 'metrics' } = {},
) {
  const envValue = process.env.PROJECTION_INTERVAL_SECONDS;
  const intervalSeconds = parseInt(envValue ?? '120', 10) || 120;
  const intervalMinutes = Math.round(intervalSeconds / 60);

  const lastSyncedAt = checkpoint?.completedAt?.toISOString() ?? null;

  let nextSyncAt: string | null = null;

  if (lastSyncedAt) {
    const now = Date.now();
    const next = Math.ceil(now / (intervalSeconds * 1000)) * (intervalSeconds * 1000);
    nextSyncAt = new Date(next).toISOString();
  } else {
    nextSyncAt = new Date().toISOString();
  }

  const inProgress = checkpoint?.status === 'running';

  return {
    success: true,
    data: {
      lastSyncedAt,
      lastSyncDate: lastSyncedAt ? new Date(lastSyncedAt).toISOString().split('T')[0] : null,
      nextSyncAt,
      cronIntervalMinutes: intervalMinutes,
      inProgress,
      lastError: checkpoint?.lastError ?? lastSyncError,
      degraded: options.degraded ?? false,
      source: options.source ?? 'database',
    },
  };
}

async function handleSyncStatus() {
  await protectApi(['admin', 'superadmin', 'helpdesk']);

  const checkpoint = await prisma.ticket_projection_checkpoint.findUnique({
    where: { name: CHECKPOINT_NAME },
  });

  const payload = await buildStatusResponse(checkpoint);
  cachedStatusResponse = {
    payload,
    expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
  };
  return NextResponse.json(payload);
}

async function handleSyncStatusFromMetrics() {
  await protectApi(['admin', 'superadmin', 'helpdesk']);

  const projectionHealth = await getProjectionHealth();
  const completedAt = projectionHealth.lastProjectionTime
    ? new Date(projectionHealth.lastProjectionTime)
    : null;

  const payload = await buildStatusResponse(
    {
      completedAt,
      status:
        projectionHealth.lastProjectionStatus === 'running'
          ? 'running'
          : projectionHealth.lastProjectionStatus === 'failed'
            ? 'failed'
            : 'success',
      lastError:
        projectionHealth.lastProjectionStatus === 'failed'
          ? 'Projection status reported failed'
          : null,
    } as Awaited<ReturnType<typeof prisma.ticket_projection_checkpoint.findUnique>>,
    { degraded: true, source: 'metrics' },
  );
  return NextResponse.json(payload);
}

function getCachedSyncStatusResponse(): Response | null {
  if (!cachedStatusResponse) return null;
  if (Date.now() > cachedStatusResponse.expiresAt) {
    cachedStatusResponse = null;
    return null;
  }
  return NextResponse.json(cachedStatusResponse.payload);
}

export async function GET() {
  try {
    return await handleSyncStatus();
  } catch (error: any) {
    const status = getErrorStatus(error, 500);
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          success: false,
          message: error?.message ?? 'Unauthorized',
        },
        { status },
      );
    }
    if (isConnectionLostError(error) || isConnectionPoolError(error)) {
      logger.warn('[SyncStatus] Database connection busy/lost — serving cached or metrics snapshot');
      const cached = getCachedSyncStatusResponse();
      if (cached) return cached;
      return handleSyncStatusFromMetrics();
    }
    logger.error('GET /sync/status error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch sync status' },
      { status: 500 },
    );
  }
}
