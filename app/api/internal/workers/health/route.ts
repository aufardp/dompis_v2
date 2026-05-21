import { NextResponse } from 'next/server';
import { redis, getRedisStatus } from '@/lib/redis';
import { getActiveLocks, getLockStatus } from '@/lib/distributed-lock';
import { getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';

export async function GET() {
  const [ingestionLock, projectionLock, syncHealth, projectionHealth] =
    await Promise.all([
      getLockStatus('ingestion'),
      getLockStatus('projection'),
      getSyncHealth(),
      getProjectionHealth(),
    ]);

  const [ingestionHeartbeat, projectionHeartbeat] = await Promise.all([
    redis.hgetall('worker:heartbeat:ingestion-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:projection-worker').catch(() => ({})),
  ]);

  return NextResponse.json({
    status: 'ok',
    redis: { status: getRedisStatus() },
    locks: {
      ingestion: ingestionLock,
      projection: projectionLock,
      local: getActiveLocks(),
    },
    heartbeat: {
      ingestion: ingestionHeartbeat,
      projection: projectionHeartbeat,
    },
    metrics: {
      ingestion: syncHealth,
      projection: projectionHealth,
    },
    timestamp: new Date().toISOString(),
  });
}
