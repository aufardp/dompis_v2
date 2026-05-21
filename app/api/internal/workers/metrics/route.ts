import { NextResponse } from 'next/server';
import { redis, getRedisStatus } from '@/lib/redis';
import { getLockStatus } from '@/lib/distributed-lock';
import { getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';

function metric(name: string, value: number, labels: Record<string, string> = {}): string {
  const labelText = Object.entries(labels)
    .map(([key, labelValue]) => `${key}="${labelValue.replace(/"/g, '\\"')}"`)
    .join(',');
  return `${name}${labelText ? `{${labelText}}` : ''} ${value}`;
}

function numberFrom(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const [ingestionLock, projectionLock, syncHealth, projectionHealth] =
    await Promise.all([
      getLockStatus('ingestion'),
      getLockStatus('projection'),
      getSyncHealth(),
      getProjectionHealth(),
    ]);
  const [ingestionHeartbeat, projectionHeartbeat] = await Promise.all([
    redis
      .hgetall('worker:heartbeat:ingestion-worker')
      .catch((): Record<string, string> => ({})),
    redis
      .hgetall('worker:heartbeat:projection-worker')
      .catch((): Record<string, string> => ({})),
  ]);
  const memory = process.memoryUsage();

  const lines = [
    '# HELP dompis_worker_up Worker heartbeat freshness and process status.',
    '# TYPE dompis_worker_up gauge',
    metric('dompis_worker_up', getRedisStatus() === 'ready' ? 1 : 0, { worker: 'api' }),
    metric('dompis_worker_running', numberFrom(ingestionHeartbeat.running === 'true' ? 1 : 0), { worker: 'ingestion' }),
    metric('dompis_worker_running', numberFrom(projectionHeartbeat.running === 'true' ? 1 : 0), { worker: 'projection' }),
    metric('dompis_worker_consecutive_errors', numberFrom(ingestionHeartbeat.consecutiveErrors), { worker: 'ingestion' }),
    metric('dompis_worker_consecutive_errors', numberFrom(projectionHeartbeat.consecutiveErrors), { worker: 'projection' }),
    metric('dompis_worker_lock_held', ingestionLock.held ? 1 : 0, { task: 'ingestion' }),
    metric('dompis_worker_lock_held', projectionLock.held ? 1 : 0, { task: 'projection' }),
    metric('dompis_worker_lock_ttl_ms', ingestionLock.ttlMs ?? 0, { task: 'ingestion' }),
    metric('dompis_worker_lock_ttl_ms', projectionLock.ttlMs ?? 0, { task: 'projection' }),
    metric('dompis_ingestion_processed_total', syncHealth.rowsProcessed),
    metric('dompis_ingestion_inserted_total', syncHealth.insertedCount),
    metric('dompis_ingestion_updated_total', syncHealth.updatedCount),
    metric('dompis_ingestion_skipped_total', syncHealth.skippedCount),
    metric('dompis_ingestion_failed_total', syncHealth.failedCount),
    metric('dompis_ingestion_quarantined_total', syncHealth.quarantinedCount),
    metric('dompis_projection_processed_total', projectionHealth.processedRecords),
    metric('dompis_projection_inserted_total', projectionHealth.insertedRecords),
    metric('dompis_projection_updated_total', projectionHealth.updatedRecords),
    metric('dompis_projection_failed_total', projectionHealth.failedRecords),
    metric('dompis_process_heap_used_bytes', memory.heapUsed),
    metric('dompis_process_rss_bytes', memory.rss),
  ];

  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4' },
  });
}
