import { NextResponse } from 'next/server';
import { redis, getRedisStatus } from '@/lib/redis';
import { getActiveLocks, getLockStatus } from '@/lib/distributed-lock';
import { getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';

export async function GET() {
  const [ingestionLock, projectionLock, activeRefreshLock, syncHealth, projectionHealth] =
    await Promise.all([
      getLockStatus('ingestion'),
      getLockStatus('projection'),
      getLockStatus('active_refresh'),
      getSyncHealth(),
      getProjectionHealth(),
    ]);

  const [ingestionHeartbeat, projectionHeartbeat, activeRefreshHeartbeat, activeRefreshMetrics] = await Promise.all([
    redis.hgetall('worker:heartbeat:ingestion-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:projection-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:active-refresh-worker').catch(() => ({})),
    redis.hgetall('active-refresh:metrics').catch(() => ({})),
  ]);

  return NextResponse.json({
    status: 'ok',
    redis: { status: getRedisStatus() },
    locks: {
      ingestion: ingestionLock,
      projection: projectionLock,
      activeRefresh: activeRefreshLock,
      local: getActiveLocks(),
    },
    heartbeat: {
      ingestion: ingestionHeartbeat,
      projection: projectionHeartbeat,
      activeRefresh: activeRefreshHeartbeat,
    },
    metrics: {
      ingestion: syncHealth,
      projection: projectionHealth,
      activeRefresh: activeRefreshMetrics,
    },
    timestamp: new Date().toISOString(),
  });
}
