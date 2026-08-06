import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis, isRedisReady } from '@/lib/redis';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/observability/logger';
import { WorkerTaskState, shouldRunWithCircuitBreaker, nowWIB, runWithCorrelationContext } from '@/lib/workers/task-runner';
import { iterateNossaOpen, iterateNossaClosedIncremental, iterateNossaClosedWindow, fetchByIncident } from './nossa';
import { RATE_LIMIT_KEY_BACKFILL, RATE_LIMIT_KEY } from './client';
import { normalizeExternalRow } from '@/lib/ingestion/normalizer';
import { processRawRows, ChunkResult } from '@/lib/ingestion';
import type { ExternalCursorDefinition } from '@/lib/external-db/connection';
import { QosmicResource, QosmicRawRow } from './types';

// ── Constants ───────────────────────────────────────────────────────
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 10000);

const CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  retryStrategy: (times: number) => {
    if (times > 10) {
      return null; // stop retrying after 10 attempts
    }
    return Math.min(times * 500, 5000); // 500ms, 1s, 1.5s ... up to 5s
  },
  keepAlive: 10000,
};

const CONCURRENCY = Number(process.env.BULLMQ_CONCURRENCY ?? 3);
const MAX_CONSECUTIVE_ERRORS = Number(process.env.BRIDGE_MAX_CONSECUTIVE_ERRORS ?? 5);
const CIRCUIT_RESET_MS = Number(process.env.BRIDGE_CIRCUIT_RESET_MINUTES ?? 10) * 60_000;

const BRIDGE_JOB_SEARCH_ENABLED = process.env.BRIDGE_JOB_SEARCH_ENABLED === 'true';
const BRIDGE_JOB_REFRESH_ENABLED = process.env.BRIDGE_JOB_REFRESH_ENABLED === 'true';
const BRIDGE_JOB_INGESTION_ENABLED = process.env.BRIDGE_JOB_INGESTION_ENABLED === 'true';
const BRIDGE_JOB_BACKFILL_ENABLED = process.env.BRIDGE_JOB_BACKFILL_ENABLED === 'true';

// ── Data columns (SANS sourceUpdatedAt, syncVersion, metadata) ─────
// These match ticket_raw columns that the bridge API can provide
const DATA_COLUMNS = [
  'incident', 'sourceTable', 'status', 'status_date',
  'date_modified', 'worklog_summary', 'last_update_worklog',
  'closed_reopen_by', 'realm', 'tsc_result', 'scc_result',
  'service_no', 'customer_id', 'customer_name',
  'customer_segment', 'witel', 'region', 'symptom', 'cause',
  'channel', 'workzone', 'source_ticket', 'external_ticket_id',
  'service_type', 'slg', 'rk_information', 'technology',
  'ticket_id_gamas', 'reported_date', 'ttr_customer',
  'ttr_nasional', 'ttr_region', 'ttr_witel', 'ttr_mitra',
  'ttr_agent', 'owner', 'owner_group', 'description_actual_solution',
  'classification_path', 'impacted_site', 'reported_by',
  'ttr_pending', 'incident_domain', 'technician', 'customer_type',
  'resolution', 'gaul', 'contact_email', 'resolve_date',
  'description_assignment', 'ttr_end_to_end', 'guarantee_status',
  'related_to_gamas', 'booking_date', 'urgency', 'solution',
  'closed_by', 'street_address',
  'lastSeenAt', 'importedAt', 'import_batch',
  'syncBatchId', 'sync_date',
];

// ── Staleness + NOT NULL Guard ──────────────────────────────────────
function buildUpsertSetClause(): string {
  const guards = DATA_COLUMNS.map(col => `
    ${col} = IF(
      VALUES(sourceUpdatedAt) IS NOT NULL
      AND (sourceUpdatedAt IS NULL OR VALUES(sourceUpdatedAt) >= sourceUpdatedAt)
      AND VALUES(${col}) IS NOT NULL,
      VALUES(${col}), ${col}
    )`
  );

  return `
    sourceUpdatedAt = CASE
      WHEN VALUES(sourceUpdatedAt) IS NULL THEN sourceUpdatedAt
      WHEN sourceUpdatedAt IS NULL THEN VALUES(sourceUpdatedAt)
      ELSE GREATEST(VALUES(sourceUpdatedAt), sourceUpdatedAt)
    END,
    syncVersion = IF(
      VALUES(sourceUpdatedAt) IS NOT NULL
      AND (sourceUpdatedAt IS NULL OR VALUES(sourceUpdatedAt) >= sourceUpdatedAt),
      syncVersion + 1, syncVersion
    ),
    isActive = TRUE,
    ${guards.join(',\n')}
  `;
}

const UPSERT_SET_CLAUSE = buildUpsertSetClause();

// ── Per-Incident Lock ────────────────────────────────────────────────
function lockKey(incident: string): string {
  return `ticket_raw:lock:${incident}`;
}

async function acquireWriteLock(incident: string, ttlMs = 5000): Promise<string | null> {
  const ownerId = `${process.pid}:${Date.now()}`;
  try {
    const ok = await redis.set(lockKey(incident), ownerId, 'PX', ttlMs, 'NX');
    return ok ? ownerId : null;
  } catch {
    return null;
  }
}

async function releaseWriteLock(incident: string, ownerId: string): Promise<void> {
  // Lua script: only delete if we still own it
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end
    return 0
  `;
  try {
    await redis.eval(script, 1, lockKey(incident), ownerId);
  } catch {
    // Best-effort; TTL will auto-release
  }
}

// ── Circuit Breaker State ────────────────────────────────────────────
const circuitState: WorkerTaskState = {
  running: false,
  lastRunAt: null,
  consecutiveErrors: 0,
  circuitOpenedAt: null,
  lastError: null,
  abortController: null,
};

function isTransientBridgeError(err: unknown): boolean {
  if (err instanceof Error) {
    const status = (err as any).status;
    if (status === 401 || status === 422) return false;
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
    if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) return true;
  }
  return true; // default to transient for unknown errors
}

export function getBridgeCircuitState(): {
  consecutiveErrors: number;
  circuitOpenedAt: Date | null;
  lastError: string | null;
} {
  return {
    consecutiveErrors: circuitState.consecutiveErrors,
    circuitOpenedAt: circuitState.circuitOpenedAt,
    lastError: circuitState.lastError,
  };
}

// ── Queues ───────────────────────────────────────────────────────────
export const interactiveQueue = new Queue('bridge-interactive', {
  connection: CONNECTION,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const ingestionQueue = new Queue('bridge-ingestion', {
  connection: CONNECTION,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export const backfillQueue = new Queue('bridge-backfill', {
  connection: CONNECTION,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export const queueEvents = new QueueEvents('bridge-interactive', { connection: CONNECTION });

// ── Helpers ───────────────────────────────────────────────────────────
function computeBatchId(): string {
  return `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Handlers ──────────────────────────────────────────────────────────

async function handleIngestNossa(job: any): Promise<{ processed: number }> {
  const tableName = job.data.table as string;
  const correlationId = job.data.correlationId;
  const batchId = computeBatchId();
  let processed = 0;

  await runWithCorrelationContext(correlationId, async () => {
    logger.info('[Bridge] Ingest starting', { tableName, batchId, jobId: job.id });

    const iterator = tableName === 'nossa'
      ? iterateNossaOpen()
      : iterateNossaClosedIncremental(7);

    const cursor: ExternalCursorDefinition = {
      idColumn: null,
      modifiedColumn: null,
      createdAtColumn: null,
      strategy: 'snapshot',
      columns: [],
    };

    for await (const rows of iterator) {
      const rawRows = rows as QosmicRawRow[];
      if (rawRows.length === 0) continue;

      const result: ChunkResult = {
        processed: 0, inserted: 0, updated: 0,
        skipped: 0, failed: 0, quarantined: 0,
        retried: 0, errors: [],
      };

      await processRawRows(rawRows as Record<string, unknown>[], tableName, batchId, cursor, result);

      processed += result.processed;

      await job.updateProgress({ processed });
    }

    logger.info('[Bridge] Ingest complete', { tableName, batchId, processed });
  });

  return { processed };
}

async function handleRefreshTicket(job: any): Promise<{ found: boolean }> {
  const { incident, sourceTable } = job.data;
  const correlationId = job.data.correlationId;

  return runWithCorrelationContext(correlationId, async () => {
    const resource = sourceTable === 'nossa_closed' ? 'nossa_closed' : 'nossa';
    const row = await fetchByIncident(resource, String(incident));
    if (!row) return { found: false };

    const ownerId = await acquireWriteLock(String(incident));
    if (!ownerId) return { found: false }; // another handler is writing

    try {
      await upsertTicketRaw(row, resource, 'refresh-' + computeBatchId());
      return { found: true };
    } finally {
      await releaseWriteLock(String(incident), ownerId);
    }
  });
}

async function handleSearchIncident(job: any): Promise<{ found: boolean }> {
  const incident = job.data.incident;
  const correlationId = job.data.correlationId;

  return runWithCorrelationContext(correlationId, async () => {
    // Try both resources if needed
    let row = await fetchByIncident('nossa', String(incident));
    let resource: QosmicResource = 'nossa';
    if (!row) {
      row = await fetchByIncident('nossa_closed', String(incident));
      resource = 'nossa_closed';
    }
    if (!row) return { found: false };

    const ownerId = await acquireWriteLock(String(incident));
    if (!ownerId) return { found: false };

    try {
      await upsertTicketRaw(row, resource, 'search-' + computeBatchId());
      return { found: true };
    } finally {
      await releaseWriteLock(String(incident), ownerId);
    }
  });
}

async function handleBackfillWindow(job: any): Promise<{ processed: number }> {
  const { from, to } = job.data;
  const correlationId = job.data.correlationId ?? `backfill-${job.id}`;
  const batchId = computeBatchId();
  let processed = 0;

  await runWithCorrelationContext(correlationId, async () => {
    logger.info('[Bridge] Backfill window starting', { from, to, batchId, jobId: job.id });

    const dateWindow = { dateFrom: from, dateTo: to };

    for await (const rows of iterateNossaClosedWindow(dateWindow, {}, RATE_LIMIT_KEY_BACKFILL)) {
      const rawRows = rows as QosmicRawRow[];
      for (const raw of rawRows) {
        const incident = raw.Incident ?? raw.incident;
        if (!incident) continue;

        const ownerId = await acquireWriteLock(String(incident));
        if (!ownerId) continue;

        try {
          await upsertTicketRaw(raw, 'nossa_closed', batchId);
          processed++;
        } finally {
          await releaseWriteLock(String(incident), ownerId);
        }
      }

      await job.updateProgress({ processed });
    }

    logger.info('[Bridge] Backfill window complete', { from, to, processed });
  });

  return { processed };
}

// ── Helpers for dynamic SQL ─────────────────────────────────────────
function sqlId(id: string): Prisma.Sql {
  if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`Unsafe SQL identifier: ${id}`);
  return Prisma.raw(`\`${id}\``);
}

const MAX_COLUMN_LENGTH: Record<string, number> = {
  incident: 50, workzone: 10, gaul: 10, related_to_gamas: 10,
  classification_flag: 20, customer_segment: 20, service_type: 50,
  channel: 20, closed_by: 100, closed_reopen_by: 100,
  source_ticket: 50, external_ticket_id: 50, customer_id: 100,
  service_id: 100, service_no: 100, slg: 50, technology: 50,
  owner: 100, owner_group: 100, witel: 100, region: 50,
  reported_by: 50, ttr_agent: 20, ttr_mitra: 20, ttr_nasional: 20,
  ttr_region: 20, ttr_witel: 20, ttr_end_to_end: 20, ttr_pending: 20,
  ttr_customer: 100, guarantee_status: 50, impacted_site: 50,
  resolve_date: 50, incident_domain: 100, cause: 50, resolution: 50,
  technician: 255, customer_type: 100, customer_name: 255,
  description_actual_solution: 100, classification_path: 100,
  description_assignment: 100, booking_date: 50, urgency: 20,
  realm: 100, solution: 100, tsc_result: 100, scc_result: 100,
  rk_information: 100, ticket_id_gamas: 100, street_address: 500,
  external_ticket_tier_3: 50, customer_category: 50,
  notes_eskalasi: 255, note: 255, sn_ont: 30, tipe_ont: 20,
  manufacture_ont: 20, teritory_near_end: 50, teritory_far_end: 50,
  urgency_description: 100, contact_phone: 50, contact_name: 100,
  contact_email: 255, reported_priority: 100, subsidiary: 100,
  perangkat: 100, device_name: 100, hierarchy_path: 100,
  status: 50, status_date: 100, date_modified: 50,
  worklog_summary: 100, last_update_worklog: 100,
  sourceTable: 50, import_batch: 100, syncBatchId: 50,
};

function sqlVal(value: unknown, col?: string): Prisma.Sql {
  if (value === null || value === undefined) return Prisma.sql`NULL`;
  if (typeof value === 'number') return Prisma.sql`${value}`;
  if (typeof value === 'boolean') return Prisma.sql`${value}`;
  if (value instanceof Date) return Prisma.sql`${value}`;
  let str = String(value);
  if (col && MAX_COLUMN_LENGTH[col]) {
    str = str.slice(0, MAX_COLUMN_LENGTH[col]);
  }
  return Prisma.sql`${str}`;
}

// ── Upsert with Staleness + NOT NULL Guard ──────────────────────────

const UPSERT_META_COLS = [
  'sourceUpdatedAt', 'lastSeenAt', 'importedAt', 'syncBatchId',
  'sync_date', 'synced_at', 'import_batch', 'isActive',
];

async function upsertTicketRaw(
  raw: QosmicRawRow,
  sourceTable: string,
  batchId: string,
): Promise<void> {
  const normalized = normalizeExternalRow(raw as any, sourceTable);
  const now = new Date();
  const todayWib = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).split('/').reverse().join('-');
  const incident = String(normalized.incident ?? raw.Incident ?? raw.incident ?? '');
  if (!incident) return;

  const sourceUpdatedAt = normalized.date_modified ? new Date(normalized.date_modified) : now;

  const insertCols = ['incident', 'sourceTable', ...UPSERT_META_COLS, ...DATA_COLUMNS];
  const uniqueCols = [...new Set(insertCols)];

  const values = uniqueCols.map((col) => {
    switch (col) {
      case 'incident': return sqlVal(incident);
      case 'sourceTable': return sqlVal(sourceTable);
      case 'sourceUpdatedAt': return sqlVal(sourceUpdatedAt);
      case 'lastSeenAt': case 'importedAt': case 'synced_at': return sqlVal(now);
      case 'syncBatchId': case 'import_batch': return sqlVal(batchId);
      case 'sync_date': return sqlVal(todayWib);
      case 'isActive': return sqlVal(true);
      default: return sqlVal(normalized[col as keyof typeof normalized], col);
    }
  });

  const colIdentifiers = uniqueCols.map((c) => sqlId(c));

  await prisma.$executeRaw`
    INSERT INTO ticket_raw
      (${Prisma.join(colIdentifiers)})
    VALUES
      (${Prisma.join(values)})
    ON DUPLICATE KEY UPDATE
      ${Prisma.raw(UPSERT_SET_CLAUSE)}
  `;
}

// ── Worker refs (null until startBridgeWorkers) ─────────────────────────
let workerInteractive: Worker | null = null;
let workerIngestion: Worker | null = null;
let workerBackfill: Worker | null = null;

// ── Error / Completion Hooks ─────────────────────────────────────────

function setupWorkerHooks(worker: Worker): void {
  worker.on('completed', (job) => {
    circuitState.consecutiveErrors = 0;
    circuitState.circuitOpenedAt = null;
    circuitState.lastError = null;
  });

  worker.on('failed', (job, err) => {
    logger.error('[Bridge] Job failed', err, {
      jobId: job?.id,
      name: job?.name,
      attempts: job?.attemptsMade,
    });

    if (isTransientBridgeError(err)) {
      circuitState.consecutiveErrors++;
      circuitState.lastError = err.message;
    }
  });
}

function createWorker(name: string, handler: (job: any) => Promise<any>, concurrency: number): Worker {
  const w = new Worker(name, handler, { connection: CONNECTION, concurrency });
  setupWorkerHooks(w);
  return w;
}

// ── Start / Stop ─────────────────────────────────────────────────────

export async function startBridgeWorkers(): Promise<void> {
  logger.info('[Bridge] Starting workers', {
    interactive: { concurrency: 2, enabled: { search: BRIDGE_JOB_SEARCH_ENABLED, refresh: BRIDGE_JOB_REFRESH_ENABLED } },
    ingestion: { concurrency: 1, enabled: BRIDGE_JOB_INGESTION_ENABLED },
    backfill: { concurrency: 1, enabled: BRIDGE_JOB_BACKFILL_ENABLED },
  });

  workerInteractive = createWorker(
    'bridge-interactive',
    async (job) => {
      if (!shouldRunWithCircuitBreaker(circuitState, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, 'bridge-worker')) {
        logger.warn('[Bridge] Circuit open, skipping job', { jobId: job.id, name: job.name });
        return { skipped: true, reason: 'circuit_open' };
      }

      switch (job.name) {
        case 'search-incident':
          if (!BRIDGE_JOB_SEARCH_ENABLED) return { skipped: true, reason: 'disabled' };
          return handleSearchIncident(job);
        case 'refresh-ticket':
          if (!BRIDGE_JOB_REFRESH_ENABLED) return { skipped: true, reason: 'disabled' };
          return handleRefreshTicket(job);
        default:
          logger.warn('[Bridge] Unknown job name', { jobId: job.id, name: job.name });
          return { skipped: true, reason: 'unknown_job' };
      }
    },
    2,
  );

  workerIngestion = createWorker(
    'bridge-ingestion',
    async (job) => {
      if (!BRIDGE_JOB_INGESTION_ENABLED) return { skipped: true, reason: 'disabled' };

      switch (job.name) {
        case 'ingest-nossa':
        case 'ingest-nossa_closed':
          return handleIngestNossa(job);
        default:
          return { skipped: true, reason: 'unknown_job' };
      }
    },
    1,
  );

  workerBackfill = createWorker(
    'bridge-backfill',
    async (job) => {
      if (!BRIDGE_JOB_BACKFILL_ENABLED) return { skipped: true, reason: 'disabled' };

      switch (job.name) {
        case 'backfill:window':
          return handleBackfillWindow(job);
        default:
          return { skipped: true, reason: 'unknown_job' };
      }
    },
    1,
  );

  await Promise.all([
    workerInteractive.waitUntilReady(),
    workerIngestion.waitUntilReady(),
    workerBackfill.waitUntilReady(),
  ]);

  logger.info('[Bridge] All workers ready');
}

export async function stopBridgeWorkers(): Promise<void> {
  logger.info('[Bridge] Stopping workers...');
  await Promise.all([
    workerInteractive?.close(),
    workerIngestion?.close(),
    workerBackfill?.close(),
    queueEvents.close(),
  ]);
  logger.info('[Bridge] All workers stopped');
}

export async function getDLQCounts(): Promise<{
  interactive: number;
  ingestion: number;
  backfill: number;
  total: number;
}> {
  const [i, ing, b] = await Promise.all([
    interactiveQueue.getJobCounts('failed') as any,
    ingestionQueue.getJobCounts('failed') as any,
    backfillQueue.getJobCounts('failed') as any,
  ]);
  return {
    interactive: Number(i?.failed ?? 0),
    ingestion: Number(ing?.failed ?? 0),
    backfill: Number(b?.failed ?? 0),
    total: Number(i?.failed ?? 0) + Number(ing?.failed ?? 0) + Number(b?.failed ?? 0),
  };
}

export interface BridgeQueueJobSnapshot {
  id: string | undefined;
  name: string;
  attemptsMade: number;
  failedReason: string;
  timestamp: number | undefined;
  finishedOn: number | undefined;
  durationMs: number | null;
}

export interface BridgeQueueSnapshot {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  recentFailed: BridgeQueueJobSnapshot[];
}

export async function getBridgeQueueStatus(): Promise<BridgeQueueSnapshot[]> {
  const queues = [
    { name: 'interactive', queue: interactiveQueue },
    { name: 'ingestion', queue: ingestionQueue },
    { name: 'backfill', queue: backfillQueue },
  ] as const;

  return Promise.all(
    queues.map(async ({ name, queue }) => {
      const counts = (await queue.getJobCounts()) as any;
      const failedJobs = await queue.getFailed(0, 10);
      return {
        name,
        waiting: Number(counts.waiting ?? 0),
        active: Number(counts.active ?? 0),
        delayed: Number(counts.delayed ?? 0),
        completed: Number(counts.completed ?? 0),
        failed: Number(counts.failed ?? 0),
        recentFailed: failedJobs.map((job) => ({
          id: job.id,
          name: job.name,
          attemptsMade: job.attemptsMade,
          failedReason: String(job.failedReason ?? '').slice(0, 800),
          timestamp: job.timestamp,
          finishedOn: job.finishedOn ?? undefined,
          durationMs:
            job.finishedOn != null ? Math.max(0, job.finishedOn - job.timestamp) : null,
        })),
      };
    }),
  );
}

export async function getBridgeRateUsage(): Promise<{
  global: { used: number; limit: number };
  backfill: { used: number; limit: number };
} | null> {
  try {
    const keyFor = (key: string) => `ratelimit:${key}`;
    const [globalUsed, backfillUsed] = await Promise.all([
      redis.zcard(keyFor(RATE_LIMIT_KEY)).catch(() => 0),
      redis.zcard(keyFor(RATE_LIMIT_KEY_BACKFILL)).catch(() => 0),
    ]);
    const totalLimit = Number(process.env.QOSMIC_BRIDGE_RATE_LIMIT_PER_MIN ?? 20);
    const backfillLimit = Number(process.env.QOSMIC_BRIDGE_BACKFILL_RATE_LIMIT_PER_MIN ?? 6);
    return {
      global: { used: Number(globalUsed), limit: Math.max(0, totalLimit - backfillLimit) },
      backfill: { used: Number(backfillUsed), limit: backfillLimit },
    };
  } catch {
    return null;
  }
}
