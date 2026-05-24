import { NextResponse } from 'next/server';
import { redis, getRedisStatus } from '@/lib/redis';
import { getActiveLocks, getLockStatus } from '@/lib/distributed-lock';
import { getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';

export async function GET() {
  const [ingestionLock, projectionLock, activeRefreshLock, statusRefreshLock, syncHealth, projectionHealth] =
    await Promise.all([
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
    activeRefreshMetrics,
    statusRefreshMetrics,
  ] = await Promise.all([
    redis.hgetall('worker:heartbeat:ingestion-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:projection-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:active-refresh-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:status-refresh-worker').catch(() => ({})),
    redis.hgetall('active-refresh:metrics').catch(() => ({})),
    redis.hgetall('status-refresh:metrics').catch(() => ({})),
  ]);

  return NextResponse.json({
    status: 'ok',
    redis: { status: getRedisStatus() },
    locks: {
      ingestion: ingestionLock,
      projection: projectionLock,
      activeRefresh: activeRefreshLock,
      statusRefresh: statusRefreshLock,
      local: getActiveLocks(),
    },
    heartbeat: {
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
    timestamp: new Date().toISOString(),
  });
}
