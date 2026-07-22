import { NextRequest, NextResponse } from 'next/server';
import { redis, getRedisStatus } from '@/lib/redis';
import { getActiveLocks, getLockStatus } from '@/lib/distributed-lock';
import { getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';
import { authorizeInternalRoute } from '@/app/libs/internalRouteAuth';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getMetricAgeMs, parseProjectionCheckpointMeta } from '@/lib/observability/worker-health';
import { getExternalPool } from '@/lib/external-db/connection';
import { getSloSummary } from '@/lib/observability/slo-tracker';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache } from '@/lib/cache';

const WORKER_NAMES = ['ingestion-worker', 'projection-worker', 'active-refresh-worker', 'status-refresh-worker', 'ops-worker'] as const;
const CACHE_TTL_SECONDS = 30;
const CACHE_KEY = 'internal_workers_health:v1';

function getExternalPoolStats(): { total: number; active: number; idle: number; queue: number } | null {
  const pool = getExternalPool();
  if (!pool) return null;
  try {
    const p = (pool as unknown as { pool: { totalConnections: number; activeConnections: number; idleConnections: number; queueSize: number } }).pool;
    return {
      total: p.totalConnections,
      active: p.activeConnections,
      idle: p.idleConnections,
      queue: p.queueSize,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    await authorizeInternalRoute(req);

    const data = await getOrSetCache(CACHE_KEY, async () => {
      const [
        ingestionLock,
        projectionLock,
        activeRefreshLock,
        statusRefreshLock,
        syncHealth,
        projectionHealth,
      ] = await Promise.all([
        getLockStatus('ingestion'),
        getLockStatus('projection'),
        getLockStatus('active_refresh'),
        getLockStatus('status_refresh'),
        getSyncHealth(),
        getProjectionHealth(),
      ]);

      const [
        ingestionHeartbeat,
        projectionHeartbeat,
        activeRefreshHeartbeat,
        statusRefreshHeartbeat,
        opsWorkerHeartbeat,
        activeRefreshMetrics,
        statusRefreshMetrics,
      ] = await Promise.all([
        redis.hgetall('worker:heartbeat:ingestion-worker').catch(() => ({})),
        redis.hgetall('worker:heartbeat:projection-worker').catch(() => ({})),
        redis.hgetall('worker:heartbeat:active-refresh-worker').catch(() => ({})),
        redis.hgetall('worker:heartbeat:status-refresh-worker').catch(() => ({})),
        redis.hgetall('worker:heartbeat:ops-worker').catch(() => ({})),
        redis.hgetall('active-refresh:metrics').catch(() => ({})),
        redis.hgetall('status-refresh:metrics').catch(() => ({})),
      ]);

      const syncAgeMs = getMetricAgeMs(syncHealth.lastSyncTime);
      const projectionAgeMs = getMetricAgeMs(projectionHealth.lastProjectionTime);
      const projectionBacklog = parseProjectionCheckpointMeta(
        projectionHealth.checkpoint,
      );

      const externalPoolStats = getExternalPoolStats();

      const poolUtilization = externalPoolStats
        ? {
            externalDb: externalPoolStats,
            prismaPoolSize: parseInt(process.env.PRISMA_CONNECTION_LIMIT || '8', 10),
          }
        : undefined;

      const prismaTestStart = Date.now();
      let prismaConnected = false;
      try {
        await prisma.$queryRaw`SELECT 1 AS ok`;
        prismaConnected = true;
      } catch {
        prismaConnected = false;
      }
      const prismaPingMs = Date.now() - prismaTestStart;

      const sloSummaries: Record<string, unknown> = {};
      for (const name of WORKER_NAMES) {
        sloSummaries[name] = await getSloSummary(name);
      }

      return {
        status: prismaConnected ? 'ok' : 'degraded',
        redis: { status: getRedisStatus() },
        poolUtilization,
        prisma: { connected: prismaConnected, pingMs: prismaPingMs },
        locks: {
          ingestion: ingestionLock,
          projection: projectionLock,
          activeRefresh: activeRefreshLock,
          statusRefresh: statusRefreshLock,
          local: getActiveLocks(),
        },
        heartbeat: {
          ops: opsWorkerHeartbeat,
          ingestion: ingestionHeartbeat,
          projection: projectionHeartbeat,
          activeRefresh: activeRefreshHeartbeat,
          statusRefresh: statusRefreshHeartbeat,
        },
        metrics: {
          ingestion: syncHealth,
          projection: projectionHealth,
          activeRefresh: activeRefreshMetrics,
          statusRefresh: statusRefreshMetrics,
        },
        lag: {
          ingestionAgeMs: syncAgeMs,
          projectionAgeMs,
          projectionNeverProjected: projectionBacklog.neverProjected,
          projectionOldestPendingAgeMs: projectionBacklog.oldestPendingAgeMs,
        },
        slo: sloSummaries,
        timestamp: new Date().toISOString(),
      };
    }, CACHE_TTL_SECONDS);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch worker health'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
