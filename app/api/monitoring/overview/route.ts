export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getRedisStatus, redis } from '@/lib/redis';
import { getLockStatus } from '@/lib/distributed-lock';
import { getOnlineUsers } from '@/lib/monitoring/online-users';
import { getProjectionHealth, getSyncHealth } from '@/lib/sync-metrics/metrics';

function numberFrom(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseHeartbeat(row: Record<string, string>) {
  return {
    running: row.running === 'true',
    pid: row.pid || null,
    lastRunAt: row.lastRunAt || null,
    lastSuccessAt: row.lastSuccessAt || null,
    consecutiveErrors: numberFrom(row.consecutiveErrors),
    circuitOpen: row.circuitOpen === 'true',
  };
}

function asStringRecord(value: unknown): Record<string, string> {
  return (value ?? {}) as Record<string, string>;
}

async function pingDatabase() {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'connected',
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  await protectApi(['superadmin', 'super_admin', 'admin']);

  const [
    online,
    database,
    syncHealth,
    projectionHealth,
    ingestionLock,
    projectionLock,
    activeRefreshLock,
    statusRefreshLock,
    ingestionHeartbeat,
    projectionHeartbeat,
    activeRefreshHeartbeat,
    statusRefreshHeartbeat,
    activeRefreshMetrics,
    statusRefreshMetrics,
  ] = await Promise.all([
    getOnlineUsers(),
    pingDatabase(),
    getSyncHealth(),
    getProjectionHealth(),
    getLockStatus('ingestion'),
    getLockStatus('projection'),
    getLockStatus('active_refresh'),
    getLockStatus('status_refresh'),
    redis.hgetall('worker:heartbeat:ingestion-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:projection-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:active-refresh-worker').catch(() => ({})),
    redis.hgetall('worker:heartbeat:status-refresh-worker').catch(() => ({})),
    redis.hgetall('active-refresh:metrics').catch(() => ({})),
    redis.hgetall('status-refresh:metrics').catch(() => ({})),
  ]);

  const memory = process.memoryUsage();

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    online,
    system: {
      nodeEnv: process.env.NODE_ENV,
      pid: process.pid,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
    },
    database,
    redis: {
      status: getRedisStatus(),
    },
    locks: {
      ingestion: ingestionLock,
      projection: projectionLock,
      activeRefresh: activeRefreshLock,
      statusRefresh: statusRefreshLock,
    },
    workers: {
      ingestion: parseHeartbeat(asStringRecord(ingestionHeartbeat)),
      projection: parseHeartbeat(asStringRecord(projectionHeartbeat)),
      activeRefresh: parseHeartbeat(asStringRecord(activeRefreshHeartbeat)),
      statusRefresh: parseHeartbeat(asStringRecord(statusRefreshHeartbeat)),
    },
    sync: syncHealth,
    projection: projectionHealth,
    activeRefresh: {
      lastStatus: asStringRecord(activeRefreshMetrics).lastStatus || '',
      lastScanned: numberFrom(asStringRecord(activeRefreshMetrics).lastScanned),
      lastUpdated: numberFrom(asStringRecord(activeRefreshMetrics).lastUpdated),
      lastDurationMs: numberFrom(asStringRecord(activeRefreshMetrics).lastDurationMs),
      durationP95Ms: numberFrom(asStringRecord(activeRefreshMetrics).durationP95Ms),
      rowsPerSecond: numberFrom(asStringRecord(activeRefreshMetrics).lastRowsPerSecond),
      backlogEstimate: numberFrom(asStringRecord(activeRefreshMetrics).lastBacklogEstimate),
      effectiveBatchSize: numberFrom(asStringRecord(activeRefreshMetrics).lastEffectiveBatchSize),
      lastSuccessAt: asStringRecord(activeRefreshMetrics).lastSuccessAt || null,
      lastError: asStringRecord(activeRefreshMetrics).lastError || '',
    },
    statusRefresh: {
      lastStatus: asStringRecord(statusRefreshMetrics).lastStatus || '',
      lastScanned: numberFrom(asStringRecord(statusRefreshMetrics).lastScanned),
      lastFetched: numberFrom(asStringRecord(statusRefreshMetrics).lastFetched),
      lastChanged: numberFrom(asStringRecord(statusRefreshMetrics).lastChanged),
      lastMissing: numberFrom(asStringRecord(statusRefreshMetrics).lastMissing),
      lastDurationMs: numberFrom(asStringRecord(statusRefreshMetrics).lastDurationMs),
      durationP95Ms: numberFrom(asStringRecord(statusRefreshMetrics).durationP95Ms),
      rowsPerSecond: numberFrom(asStringRecord(statusRefreshMetrics).lastRowsPerSecond),
      backlogEstimate: numberFrom(asStringRecord(statusRefreshMetrics).lastBacklogEstimate),
      effectiveBatchSize: numberFrom(asStringRecord(statusRefreshMetrics).lastEffectiveBatchSize),
      lastSuccessAt: asStringRecord(statusRefreshMetrics).lastSuccessAt || null,
      lastError: asStringRecord(statusRefreshMetrics).lastError || '',
    },
  });
}
