export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSyncMetrics } from '@/lib/sync-metrics/metrics';
import { redis } from '@/lib/redis';
import { prisma } from '@/app/libs/prisma';
import { testExternalConnection } from '@/lib/external-db/connection';
import { authorizeInternalRoute } from '@/app/libs/internalRouteAuth';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getMetricAgeMs, parseProjectionCheckpointMeta } from '@/lib/observability/worker-health';
import { getOrSetCache } from '@/lib/cache';

const WORKER_NAMES = ['ingestion-worker', 'projection-worker', 'active-refresh-worker', 'status-refresh-worker', 'ops-worker'] as const;
const DATABASE_METRICS_CACHE_KEY = 'internal:metrics:db-snapshot';
const DATABASE_METRICS_CACHE_TTL = 15;

type DatabaseMetrics = {
  ticketRawActive: number;
  ticketCount: number;
  pendingOutbox: number;
  externalDbConnected: boolean;
};

async function collectDatabaseMetrics(): Promise<DatabaseMetrics> {
  return getOrSetCache(
    DATABASE_METRICS_CACHE_KEY,
    async () => {
      const [ticketRawActive, ticketCount, pendingOutbox, externalDbConnected] = await Promise.all([
        prisma.ticket_raw.count({ where: { isActive: true } }).catch(() => 0),
        prisma.ticket.count().catch(() => 0),
        prisma.tech_event_outbox.count({ where: { status: 'PENDING' } }).catch(() => 0),
        testExternalConnection(),
      ]);

      return {
        ticketRawActive,
        ticketCount,
        pendingOutbox,
        externalDbConnected,
      };
    },
    DATABASE_METRICS_CACHE_TTL,
  );
}

async function collectPrometheusMetrics(): Promise<string> {
  const lines: string[] = [];

  // Help/Type headers
  const metadata: Record<string, { help: string; type: string }> = {
    dompis_ingestion_records_total: { help: 'Total records processed by ingestion', type: 'counter' },
    dompis_ingestion_last_run_duration_ms: { help: 'Most recent ingestion run duration in ms', type: 'gauge' },
    dompis_ingestion_last_batch_duration_ms: { help: 'Most recent ingestion batch duration in ms', type: 'gauge' },
    dompis_ingestion_rows_per_second: { help: 'Most recent ingestion throughput in rows per second', type: 'gauge' },
    dompis_projection_records_total: { help: 'Total records processed by projection', type: 'counter' },
    dompis_projection_last_run_duration_ms: { help: 'Most recent projection run duration in ms', type: 'gauge' },
    dompis_projection_last_batch_duration_ms: { help: 'Most recent projection batch duration in ms', type: 'gauge' },
    dompis_projection_rows_per_second: { help: 'Most recent projection throughput in rows per second', type: 'gauge' },
    dompis_projection_pipeline_lag_ms: { help: 'Most recent projection end-to-end lag in ms', type: 'gauge' },
    dompis_worker_running: { help: 'Worker running state', type: 'gauge' },
    dompis_worker_consecutive_errors: { help: 'Worker consecutive errors', type: 'gauge' },
    dompis_worker_circuit_open: { help: 'Worker circuit breaker open state (1=open)', type: 'gauge' },
    dompis_worker_heartbeat_age_ms: { help: 'Milliseconds since last heartbeat', type: 'gauge' },
    dompis_sync_lag_ms: { help: 'Milliseconds since last successful sync', type: 'gauge' },
    dompis_projection_lag_ms: { help: 'Milliseconds since last successful projection', type: 'gauge' },
    dompis_db_ticket_raw_active: { help: 'Active ticket_raw records', type: 'gauge' },
    dompis_db_ticket_count: { help: 'Total ticket records', type: 'gauge' },
    dompis_db_outbox_pending: { help: 'Pending tech_event_outbox records', type: 'gauge' },
    dompis_external_db_connected: { help: 'External DB connection status (1=connected)', type: 'gauge' },
    dompis_projection_backlog: { help: 'Never-projected ticket_raw records', type: 'gauge' },
  };

  for (const [name, meta] of Object.entries(metadata)) {
    lines.push(`# HELP ${name} ${meta.help}`);
    lines.push(`# TYPE ${name} ${meta.type}`);
  }

  // Worker heartbeats
  for (const workerName of WORKER_NAMES) {
    const hb = await redis.hgetall(`worker:heartbeat:${workerName}`).catch(() => ({}));
    if (Object.keys(hb).length === 0) continue;

    const updatedAt = parseInt((hb as Record<string, string>).updatedAt ?? '0', 10);
    const ageMs = updatedAt > 0 ? Date.now() - updatedAt : 0;
    const running = (hb as Record<string, string>).running === 'true' ? 1 : 0;
    const consecutiveErrors = parseInt((hb as Record<string, string>).consecutiveErrors ?? '0', 10);
    const circuitOpen = consecutiveErrors >= 5 ? 1 : 0;

    lines.push(`dompis_worker_running{worker="${workerName}"} ${running}`);
    lines.push(`dompis_worker_consecutive_errors{worker="${workerName}"} ${consecutiveErrors}`);
    lines.push(`dompis_worker_circuit_open{worker="${workerName}"} ${circuitOpen}`);
    lines.push(`dompis_worker_heartbeat_age_ms{worker="${workerName}"} ${ageMs}`);
  }

  // Sync metrics
  const syncMetrics = await getSyncMetrics();
  const syncHealth = syncMetrics.sync as {
    lastSyncTime: number | null;
    lastSyncStatus: string;
    lastSyncDuration?: number | null;
    lastSyncRowsPerSecond?: number | null;
    lastSyncBatchDuration?: number | null;
    rowsProcessed?: number;
    insertedCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    failedCount?: number;
  };
  const projectionHealth = syncMetrics.projection as {
    lastProjectionTime: number | null;
    lastProjectionStatus: string;
    lastProjectionDuration?: number | null;
    lastProjectionLagMs?: number | null;
    lastProjectionRowsPerSecond?: number | null;
    lastProjectionBatchDuration?: number | null;
    processedRecords?: number;
    insertedRecords?: number;
    updatedRecords?: number;
    skippedRecords?: number;
    failedRecords?: number;
    checkpoint?: string | null;
  };

  if (syncHealth.lastSyncTime) {
    const syncLagMs = Date.now() - syncHealth.lastSyncTime;
    lines.push(`dompis_sync_lag_ms ${syncLagMs}`);
  }
  lines.push(`dompis_ingestion_last_run_duration_ms ${syncHealth.lastSyncDuration ?? 0}`);
  lines.push(`dompis_ingestion_last_batch_duration_ms ${syncHealth.lastSyncBatchDuration ?? 0}`);
  lines.push(`dompis_ingestion_rows_per_second ${syncHealth.lastSyncRowsPerSecond ?? 0}`);

  if (projectionHealth.lastProjectionTime) {
    const projectionLagMs = Date.now() - projectionHealth.lastProjectionTime;
    lines.push(`dompis_projection_lag_ms ${projectionLagMs}`);
  }
  lines.push(`dompis_projection_last_run_duration_ms ${projectionHealth.lastProjectionDuration ?? 0}`);
  lines.push(`dompis_projection_last_batch_duration_ms ${projectionHealth.lastProjectionBatchDuration ?? 0}`);
  lines.push(`dompis_projection_rows_per_second ${projectionHealth.lastProjectionRowsPerSecond ?? 0}`);
  lines.push(`dompis_projection_pipeline_lag_ms ${projectionHealth.lastProjectionLagMs ?? 0}`);

  const projectionBacklog = parseProjectionCheckpointMeta(projectionHealth.checkpoint);
  lines.push(`dompis_projection_backlog ${projectionBacklog.neverProjected ?? 0}`);

  // Ingestion totals
  lines.push(`dompis_ingestion_records_total{status="inserted"} ${syncHealth.insertedCount ?? 0}`);
  lines.push(`dompis_ingestion_records_total{status="updated"} ${syncHealth.updatedCount ?? 0}`);
  lines.push(`dompis_ingestion_records_total{status="skipped"} ${syncHealth.skippedCount ?? 0}`);
  lines.push(`dompis_ingestion_records_total{status="failed"} ${syncHealth.failedCount ?? 0}`);

  // Projection totals
  lines.push(`dompis_projection_records_total{status="inserted"} ${projectionHealth.insertedRecords ?? 0}`);
  lines.push(`dompis_projection_records_total{status="updated"} ${projectionHealth.updatedRecords ?? 0}`);
  lines.push(`dompis_projection_records_total{status="skipped"} ${projectionHealth.skippedRecords ?? 0}`);
  lines.push(`dompis_projection_records_total{status="failed"} ${projectionHealth.failedRecords ?? 0}`);

  // DB counts
  const { ticketRawActive, ticketCount, pendingOutbox, externalDbConnected } = await collectDatabaseMetrics();

  lines.push(`dompis_db_ticket_raw_active ${ticketRawActive}`);
  lines.push(`dompis_db_ticket_count ${ticketCount}`);
  lines.push(`dompis_db_outbox_pending ${pendingOutbox}`);
  lines.push(`dompis_external_db_connected ${externalDbConnected ? 1 : 0}`);

  return lines.join('\n') + '\n';
}

export async function GET(req: NextRequest) {
  try {
    await authorizeInternalRoute(req);

    const metrics = await collectPrometheusMetrics();

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to fetch metrics'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
