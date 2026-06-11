import { NextRequest, NextResponse } from 'next/server';
import { redis, getRedisStatus } from '@/lib/redis';
import { getLockStatus } from '@/lib/distributed-lock';
import { getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';
import { authorizeInternalRoute } from '@/app/libs/internalRouteAuth';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getMetricAgeMs, parseProjectionCheckpointMeta } from '@/lib/observability/worker-health';
import { getOrSetCache } from '@/lib/cache';

const CACHE_TTL_SECONDS = 5;
const CACHE_KEY = 'internal_workers_metrics:v1';

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

export async function GET(req: NextRequest) {
  try {
    await authorizeInternalRoute(req);

    const metrics = await getOrSetCache(CACHE_KEY, async () => {
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
        redis
          .hgetall('worker:heartbeat:ingestion-worker')
          .catch((): Record<string, string> => ({})),
        redis
          .hgetall('worker:heartbeat:projection-worker')
          .catch((): Record<string, string> => ({})),
        redis
          .hgetall('worker:heartbeat:active-refresh-worker')
          .catch((): Record<string, string> => ({})),
        redis
          .hgetall('worker:heartbeat:status-refresh-worker')
          .catch((): Record<string, string> => ({})),
        redis
          .hgetall('active-refresh:metrics')
          .catch((): Record<string, string> => ({})),
        redis
          .hgetall('status-refresh:metrics')
          .catch((): Record<string, string> => ({})),
      ]);
      const memory = process.memoryUsage();
      const syncAgeMs = getMetricAgeMs(syncHealth.lastSyncTime);
      const projectionAgeMs = getMetricAgeMs(projectionHealth.lastProjectionTime);
      const projectionBacklog = parseProjectionCheckpointMeta(
        projectionHealth.checkpoint,
      );

      const lines = [
        '# HELP dompis_worker_up Worker heartbeat freshness and process status.',
        '# TYPE dompis_worker_up gauge',
        metric('dompis_worker_up', getRedisStatus() === 'ready' ? 1 : 0, { worker: 'api' }),
        metric('dompis_worker_running', numberFrom(ingestionHeartbeat.running === 'true' ? 1 : 0), { worker: 'ingestion' }),
        metric('dompis_worker_running', numberFrom(projectionHeartbeat.running === 'true' ? 1 : 0), { worker: 'projection' }),
        metric('dompis_worker_running', numberFrom(activeRefreshHeartbeat.running === 'true' ? 1 : 0), { worker: 'active_refresh' }),
        metric('dompis_worker_running', numberFrom(statusRefreshHeartbeat.running === 'true' ? 1 : 0), { worker: 'status_refresh' }),
        metric('dompis_worker_consecutive_errors', numberFrom(ingestionHeartbeat.consecutiveErrors), { worker: 'ingestion' }),
        metric('dompis_worker_consecutive_errors', numberFrom(projectionHeartbeat.consecutiveErrors), { worker: 'projection' }),
        metric('dompis_worker_consecutive_errors', numberFrom(activeRefreshHeartbeat.consecutiveErrors), { worker: 'active_refresh' }),
        metric('dompis_worker_consecutive_errors', numberFrom(statusRefreshHeartbeat.consecutiveErrors), { worker: 'status_refresh' }),
        metric('dompis_worker_lock_held', ingestionLock.held ? 1 : 0, { task: 'ingestion' }),
        metric('dompis_worker_lock_held', projectionLock.held ? 1 : 0, { task: 'projection' }),
        metric('dompis_worker_lock_held', activeRefreshLock.held ? 1 : 0, { task: 'active_refresh' }),
        metric('dompis_worker_lock_held', statusRefreshLock.held ? 1 : 0, { task: 'status_refresh' }),
        metric('dompis_worker_lock_ttl_ms', ingestionLock.ttlMs ?? 0, { task: 'ingestion' }),
        metric('dompis_worker_lock_ttl_ms', projectionLock.ttlMs ?? 0, { task: 'projection' }),
        metric('dompis_worker_lock_ttl_ms', activeRefreshLock.ttlMs ?? 0, { task: 'active_refresh' }),
        metric('dompis_worker_lock_ttl_ms', statusRefreshLock.ttlMs ?? 0, { task: 'status_refresh' }),
        metric('dompis_ingestion_processed_total', syncHealth.rowsProcessed),
        metric('dompis_ingestion_inserted_total', syncHealth.insertedCount),
        metric('dompis_ingestion_updated_total', syncHealth.updatedCount),
        metric('dompis_ingestion_skipped_total', syncHealth.skippedCount),
        metric('dompis_ingestion_failed_total', syncHealth.failedCount),
        metric('dompis_ingestion_quarantined_total', syncHealth.quarantinedCount),
        metric('dompis_ingestion_last_sync_age_ms', syncAgeMs ?? 0),
        metric('dompis_ingestion_last_run_duration_ms', syncHealth.lastSyncDuration ?? 0),
        metric('dompis_ingestion_last_batch_duration_ms', syncHealth.lastSyncBatchDuration ?? 0),
        metric('dompis_ingestion_rows_per_second', syncHealth.lastSyncRowsPerSecond ?? 0),
        metric(
          'dompis_ingestion_last_status',
          syncHealth.lastSyncStatus === 'success'
            ? 1
            : syncHealth.lastSyncStatus === 'running'
              ? 0.5
              : 0,
        ),
        metric('dompis_projection_processed_total', projectionHealth.processedRecords),
        metric('dompis_projection_inserted_total', projectionHealth.insertedRecords),
        metric('dompis_projection_updated_total', projectionHealth.updatedRecords),
        metric('dompis_projection_failed_total', projectionHealth.failedRecords),
        metric('dompis_projection_last_run_age_ms', projectionAgeMs ?? 0),
        metric('dompis_projection_last_run_duration_ms', projectionHealth.lastProjectionDuration ?? 0),
        metric('dompis_projection_last_batch_duration_ms', projectionHealth.lastProjectionBatchDuration ?? 0),
        metric('dompis_projection_rows_per_second', projectionHealth.lastProjectionRowsPerSecond ?? 0),
        metric('dompis_projection_pipeline_lag_ms', projectionHealth.lastProjectionLagMs ?? 0),
        metric(
          'dompis_projection_last_status',
          projectionHealth.lastProjectionStatus === 'success'
            ? 1
            : projectionHealth.lastProjectionStatus === 'running'
              ? 0.5
              : 0,
        ),
        metric(
          'dompis_projection_never_projected_total',
          projectionBacklog.neverProjected ?? 0,
        ),
        metric(
          'dompis_projection_oldest_pending_age_ms',
          projectionBacklog.oldestPendingAgeMs ?? 0,
        ),
        metric('dompis_active_refresh_scanned_total', numberFrom(activeRefreshMetrics.lastScanned)),
        metric('dompis_active_refresh_updated_total', numberFrom(activeRefreshMetrics.lastUpdated)),
        metric('dompis_active_refresh_duration_ms', numberFrom(activeRefreshMetrics.lastDurationMs)),
        metric('dompis_active_refresh_duration_p95_ms', numberFrom(activeRefreshMetrics.durationP95Ms)),
        metric('dompis_active_refresh_rows_per_second', numberFrom(activeRefreshMetrics.lastRowsPerSecond)),
        metric('dompis_active_refresh_backlog_estimate', numberFrom(activeRefreshMetrics.lastBacklogEstimate)),
        metric('dompis_active_refresh_effective_batch_size', numberFrom(activeRefreshMetrics.lastEffectiveBatchSize)),
        metric('dompis_active_refresh_stopped_by_budget', activeRefreshMetrics.lastStoppedByBudget === 'true' ? 1 : 0),
        metric('dompis_status_refresh_scanned_total', numberFrom(statusRefreshMetrics.lastScanned)),
        metric('dompis_status_refresh_fetched_total', numberFrom(statusRefreshMetrics.lastFetched)),
        metric('dompis_status_refresh_changed_total', numberFrom(statusRefreshMetrics.lastChanged)),
        metric('dompis_status_refresh_missing_total', numberFrom(statusRefreshMetrics.lastMissing)),
        metric('dompis_status_refresh_duration_ms', numberFrom(statusRefreshMetrics.lastDurationMs)),
        metric('dompis_status_refresh_duration_p95_ms', numberFrom(statusRefreshMetrics.durationP95Ms)),
        metric('dompis_status_refresh_rows_per_second', numberFrom(statusRefreshMetrics.lastRowsPerSecond)),
        metric('dompis_status_refresh_backlog_estimate', numberFrom(statusRefreshMetrics.lastBacklogEstimate)),
        metric('dompis_status_refresh_effective_batch_size', numberFrom(statusRefreshMetrics.lastEffectiveBatchSize)),
        metric('dompis_process_heap_used_bytes', memory.heapUsed),
        metric('dompis_process_rss_bytes', memory.rss),
      ];
      return `${lines.join('\n')}\n`;
    }, CACHE_TTL_SECONDS);

    return new NextResponse(metrics, {
      headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch worker metrics'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
