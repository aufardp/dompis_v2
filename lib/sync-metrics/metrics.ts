import { isRedisReady, redis } from '@/lib/redis';

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
  quarantinedCount: number;
  retriedCount: number;
  tableName: string | null;
  batchId: string | null;
  checkpoint: string | null;
}

interface ProjectionHealth {
  lastProjectionTime: number | null;
  lastProjectionDuration: number | null;
  lastProjectionStatus: 'success' | 'failed' | 'running' | 'never';
  processedRecords: number;
  insertedRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  retriedRecords: number;
  protectedRecords: number;
  checkpoint: string | null;
}

const SYNC_METRICS_PREFIX = 'sync:metrics';
const PROJECTION_METRICS_PREFIX = 'projection:metrics';

function getMetricKey(prefix: string, metric: string): string {
  return `${prefix}:${metric}`;
}

async function safeHset(
  key: string,
  values: Record<string, string>,
): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.hset(key, values);
  } catch (error) {
    console.warn('[SyncMetrics] Redis hset skipped:', error);
  }
}

async function safeHget(key: string, field: string): Promise<string | null> {
  if (!isRedisReady()) return null;
  try {
    return await redis.hget(key, field);
  } catch {
    return null;
  }
}

export async function recordSyncMetric(metric: string, value: number | string): Promise<void> {
  const key = getMetricKey(SYNC_METRICS_PREFIX, metric);
  const timestamp = Date.now();

  await safeHset(key, {
    value: String(value),
    timestamp: String(timestamp),
  });
}

export async function recordProjectionMetric(metric: string, value: number | string): Promise<void> {
  const key = getMetricKey(PROJECTION_METRICS_PREFIX, metric);
  const timestamp = Date.now();

  await safeHset(key, {
    value: String(value),
    timestamp: String(timestamp),
  });
}

export async function getSyncHealth(): Promise<SyncHealth> {
  const key = getMetricKey(SYNC_METRICS_PREFIX, 'lastSync');
  const lastSyncTime = await safeHget(key, 'timestamp');
  const lastSyncDuration = await safeHget(key, 'duration');
  const lastSyncStatus = await safeHget(key, 'status');
  const rowsProcessed = await safeHget(key, 'processed');
  const insertedCount = await safeHget(key, 'inserted');
  const updatedCount = await safeHget(key, 'updated');
  const skippedCount = await safeHget(key, 'skipped');
  const failedCount = await safeHget(key, 'failed');
  const quarantinedCount = await safeHget(key, 'quarantined');
  const retriedCount = await safeHget(key, 'retried');
  const tableName = await safeHget(key, 'tableName');
  const batchId = await safeHget(key, 'batchId');
  const checkpoint = await safeHget(key, 'checkpoint');

  return {
    lastSyncTime: lastSyncTime ? parseInt(lastSyncTime) : null,
    lastSyncDuration: lastSyncDuration ? parseInt(lastSyncDuration) : null,
    lastSyncStatus: (lastSyncStatus as SyncHealth['lastSyncStatus']) || 'never',
    rowsProcessed: rowsProcessed ? parseInt(rowsProcessed) : 0,
    insertedCount: insertedCount ? parseInt(insertedCount) : 0,
    updatedCount: updatedCount ? parseInt(updatedCount) : 0,
    skippedCount: skippedCount ? parseInt(skippedCount) : 0,
    failedCount: failedCount ? parseInt(failedCount) : 0,
    quarantinedCount: quarantinedCount ? parseInt(quarantinedCount) : 0,
    retriedCount: retriedCount ? parseInt(retriedCount) : 0,
    tableName,
    batchId,
    checkpoint,
  };
}

export async function getProjectionHealth(): Promise<ProjectionHealth> {
  const key = getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection');
  const lastProjectionTime = await safeHget(key, 'timestamp');
  const lastProjectionDuration = await safeHget(key, 'duration');
  const lastProjectionStatus = await safeHget(key, 'status');
  const processedRecords = await safeHget(key, 'processed');
  const insertedRecords = await safeHget(key, 'inserted');
  const updatedRecords = await safeHget(key, 'updated');
  const skippedRecords = await safeHget(key, 'skipped');
  const failedRecords = await safeHget(key, 'failed');
  const retriedRecords = await safeHget(key, 'retried');
  const protectedRecords = await safeHget(key, 'protected');
  const checkpoint = await safeHget(key, 'checkpoint');

  return {
    lastProjectionTime: lastProjectionTime ? parseInt(lastProjectionTime) : null,
    lastProjectionDuration: lastProjectionDuration ? parseInt(lastProjectionDuration) : null,
    lastProjectionStatus: (lastProjectionStatus as ProjectionHealth['lastProjectionStatus']) || 'never',
    processedRecords: processedRecords ? parseInt(processedRecords) : 0,
    insertedRecords: insertedRecords ? parseInt(insertedRecords) : 0,
    updatedRecords: updatedRecords ? parseInt(updatedRecords) : 0,
    skippedRecords: skippedRecords ? parseInt(skippedRecords) : 0,
    failedRecords: failedRecords ? parseInt(failedRecords) : 0,
    retriedRecords: retriedRecords ? parseInt(retriedRecords) : 0,
    protectedRecords: protectedRecords ? parseInt(protectedRecords) : 0,
    checkpoint,
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
    quarantined?: number;
    retried?: number;
    tableName?: string;
    batchId?: string;
    checkpoint?: string;
  }
): Promise<void> {
  const timestamp = Date.now();
  const key = getMetricKey(SYNC_METRICS_PREFIX, 'lastSync');

  await safeHset(key, {
    status,
    timestamp: String(timestamp),
    ...(metrics?.duration !== undefined && { duration: String(metrics.duration) }),
    ...(metrics?.processed !== undefined && { processed: String(metrics.processed) }),
    ...(metrics?.inserted !== undefined && { inserted: String(metrics.inserted) }),
    ...(metrics?.updated !== undefined && { updated: String(metrics.updated) }),
    ...(metrics?.skipped !== undefined && { skipped: String(metrics.skipped) }),
    ...(metrics?.failed !== undefined && { failed: String(metrics.failed) }),
    ...(metrics?.quarantined !== undefined && { quarantined: String(metrics.quarantined) }),
    ...(metrics?.retried !== undefined && { retried: String(metrics.retried) }),
    ...(metrics?.tableName && { tableName: metrics.tableName }),
    ...(metrics?.batchId && { batchId: metrics.batchId }),
    ...(metrics?.checkpoint && { checkpoint: metrics.checkpoint }),
  });
}

export async function setProjectionStatus(
  status: ProjectionHealth['lastProjectionStatus'],
  metrics?: {
    duration?: number;
    processed?: number;
    inserted?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
    retried?: number;
    protected?: number;
    checkpoint?: string;
  }
): Promise<void> {
  const timestamp = Date.now();
  const key = getMetricKey(PROJECTION_METRICS_PREFIX, 'lastProjection');

  await safeHset(key, {
    status,
    timestamp: String(timestamp),
    ...(metrics?.duration !== undefined && { duration: String(metrics.duration) }),
    ...(metrics?.processed !== undefined && { processed: String(metrics.processed) }),
    ...(metrics?.inserted !== undefined && { inserted: String(metrics.inserted) }),
    ...(metrics?.updated !== undefined && { updated: String(metrics.updated) }),
    ...(metrics?.skipped !== undefined && { skipped: String(metrics.skipped) }),
    ...(metrics?.failed !== undefined && { failed: String(metrics.failed) }),
    ...(metrics?.retried !== undefined && { retried: String(metrics.retried) }),
    ...(metrics?.protected !== undefined && { protected: String(metrics.protected) }),
    ...(metrics?.checkpoint && { checkpoint: metrics.checkpoint }),
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
