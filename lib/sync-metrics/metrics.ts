import { redis } from '@/lib/redis';

interface SyncMetric {
  key: string;
  value: number | string;
  timestamp: number;
}

interface SyncHealth {
  lastSyncTime: number | null;
  lastSyncDuration: number | null;
  lastSyncStatus: 'success' | 'failed' | 'running' | 'never';
  rowsProcessed: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

interface ProjectionHealth {
  lastProjectionTime: number | null;
  lastProjectionDuration: number | null;
  lastProjectionStatus: 'success' | 'failed' | 'running' | 'never';
  processedRecords: number;
  insertedRecords: number;
  updatedRecords: number;
}

const SYNC_METRICS_PREFIX = 'sync:metrics';
const PROJECTION_METRICS_PREFIX = 'projection:metrics';

function getMetricKey(prefix: string, metric: string): string {
  return `${prefix}:${metric}`;
}

export async function recordSyncMetric(metric: string, value: number | string): Promise<void> {
  const key = getMetricKey(SYNC_METRICS_PREFIX, metric);
  const timestamp = Date.now();

  await redis.hset(key, {
    value: String(value),
    timestamp: String(timestamp),
  });
}

export async function recordProjectionMetric(metric: string, value: number | string): Promise<void> {
  const key = getMetricKey(PROJECTION_METRICS_PREFIX, metric);
  const timestamp = Date.now();

  await redis.hset(key, {
    value: String(value),
    timestamp: String(timestamp),
  });
}

export async function getSyncHealth(): Promise<SyncHealth> {
  const lastSyncTime = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'timestamp');
  const lastSyncDuration = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'duration');
  const lastSyncStatus = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'status');
  const rowsProcessed = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'processed');
  const insertedCount = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'inserted');
  const updatedCount = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'updated');
  const skippedCount = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'skipped');
  const failedCount = await redis.hget(getMetricKey(SYNC_METRICS_PREFIX, 'lastSync'), 'failed');

  return {
    lastSyncTime: lastSyncTime ? parseInt(lastSyncTime) : null,
    lastSyncDuration: lastSyncDuration ? parseInt(lastSyncDuration) : null,
    lastSyncStatus: (lastSyncStatus as SyncHealth['lastSyncStatus']) || 'never',
    rowsProcessed: rowsProcessed ? parseInt(rowsProcessed) : 0,
    insertedCount: insertedCount ? parseInt(insertedCount) : 0,
    updatedCount: updatedCount ? parseInt(updatedCount) : 0,
    skippedCount: skippedCount ? parseInt(skippedCount) : 0,
    failedCount: failedCount ? parseInt(failedCount) : 0,
  };
}

export async function getProjectionHealth(): Promise<ProjectionHealth> {
  const lastProjectionTime = await redis.hget(getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection'), 'timestamp');
  const lastProjectionDuration = await redis.hget(getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection'), 'duration');
  const lastProjectionStatus = await redis.hget(getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection'), 'status');
  const processedRecords = await redis.hget(getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection'), 'processed');
  const insertedRecords = await redis.hget(getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection'), 'inserted');
  const updatedRecords = await redis.hget(getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection'), 'updated');

  return {
    lastProjectionTime: lastProjectionTime ? parseInt(lastProjectionTime) : null,
    lastProjectionDuration: lastProjectionDuration ? parseInt(lastProjectionDuration) : null,
    lastProjectionStatus: (lastProjectionStatus as ProjectionHealth['lastProjectionStatus']) || 'never',
    processedRecords: processedRecords ? parseInt(processedRecords) : 0,
    insertedRecords: insertedRecords ? parseInt(insertedRecords) : 0,
    updatedRecords: updatedRecords ? parseInt(updatedRecords) : 0,
  };
}

export async function setSyncStatus(
  status: SyncHealth['lastSyncStatus'],
  metrics?: {
    duration?: number;
    processed?: number;
    inserted?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
  }
): Promise<void> {
  const timestamp = Date.now();
  const key = getMetricKey(SYNC_METRICS_PREFIX, 'lastSync');

  await redis.hset(key, {
    status,
    timestamp: String(timestamp),
    ...(metrics?.duration && { duration: String(metrics.duration) }),
    ...(metrics?.processed && { processed: String(metrics.processed) }),
    ...(metrics?.inserted && { inserted: String(metrics.inserted) }),
    ...(metrics?.updated && { updated: String(metrics.updated) }),
    ...(metrics?.skipped && { skipped: String(metrics.skipped) }),
    ...(metrics?.failed && { failed: String(metrics.failed) }),
  });
}

export async function setProjectionStatus(
  status: ProjectionHealth['lastProjectionStatus'],
  metrics?: {
    duration?: number;
    processed?: number;
    inserted?: number;
    updated?: number;
  }
): Promise<void> {
  const timestamp = Date.now();
  const key = getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection');

  await redis.hset(key, {
    status,
    timestamp: String(timestamp),
    ...(metrics?.duration && { duration: String(metrics.duration) }),
    ...(metrics?.processed && { processed: String(metrics.processed) }),
    ...(metrics?.inserted && { inserted: String(metrics.inserted) }),
    ...(metrics?.updated && { updated: String(metrics.updated) }),
  });
}

export async function getSyncMetrics(): Promise<Record<string, unknown>> {
  const syncHealth = await getSyncHealth();
  const projectionHealth = await getProjectionHealth();

  return {
    sync: syncHealth,
    projection: projectionHealth,
    worker: {
      enabled: {
        ingestion: process.env.INGESTION_ENABLED === 'true',
        projection: process.env.PROJECTION_ENABLED === 'true',
      },
      intervals: {
        ingestionMinutes: parseInt(process.env.INGESTION_INTERVAL_MINUTES || '5'),
        projectionMinutes: parseInt(process.env.PROJECTION_INTERVAL_MINUTES || '10'),
      },
    },
    timestamp: new Date().toISOString(),
  };
}

export async function checkSyncHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  const syncHealth = await getSyncHealth();
  const projectionHealth = await getProjectionHealth();

  if (syncHealth.lastSyncStatus === 'failed') {
    issues.push('Last sync failed');
  } else if (syncHealth.lastSyncStatus !== 'never' && syncHealth.lastSyncTime) {
    const timeSinceLastSync = Date.now() - syncHealth.lastSyncTime;
    const maxAllowedAge = 15 * 60 * 1000;

    if (timeSinceLastSync > maxAllowedAge) {
      issues.push(`Last sync was ${Math.round(timeSinceLastSync / 60000)} minutes ago`);
    }
  }

  if (projectionHealth.lastProjectionStatus === 'failed') {
    issues.push('Last projection failed');
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}