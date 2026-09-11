import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis, isRedisReady } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';
import { WorkerTaskState, shouldRunWithCircuitBreaker, nowWIB, runWithCorrelationContext } from '@/lib/workers/task-runner';
import { iterateNossaOpen, iterateNossaClosedIncremental, iterateNossaClosedWindow, fetchByIncident } from './nossa';
import { RATE_LIMIT_KEY_BACKFILL, RATE_LIMIT_KEY, isQosmicBridgeDown, probeBridgeHealth } from './client';
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
// Pisah circuit interactive vs ingestion agar 5 fail ingestion tidak trip search (800ms probe) — Opsi P1 2026-09-11
const circuitState: WorkerTaskState = {
  running: false,
  lastRunAt: null,
  consecutiveErrors: 0,
  circuitOpenedAt: null,
  lastError: null,
  abortController: null,
};
const circuitStateInteractive: WorkerTaskState = {
  running: false,
  lastRunAt: null,
  consecutiveErrors: 0,
  circuitOpenedAt: null,
  lastError: null,
  abortController: null,
};
const circuitStateIngestion: WorkerTaskState = {
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
  // Return worst of interactive vs ingestion
  const worst = circuitStateIngestion.consecutiveErrors >= circuitStateInteractive.consecutiveErrors
    ? circuitStateIngestion : circuitStateInteractive;
  // Fallback to legacy circuitState for backward compat
  const legacyWorst = worst.consecutiveErrors >= circuitState.consecutiveErrors ? worst : circuitState;
  return {
    consecutiveErrors: legacyWorst.consecutiveErrors,
    circuitOpenedAt: legacyWorst.circuitOpenedAt,
    lastError: legacyWorst.lastError,
  };
}

// ── Queues ───────────────────────────────────────────────────────────
export const interactiveQueue = new Queue('bridge-interactive', {
  connection: CONNECTION,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    // Refresh jobs use a stable incident jobId to deduplicate only while the
    // job is waiting/active. Retaining completed jobs would suppress the next
    // legitimate refresh for that incident.
    removeOnComplete: true,
    removeOnFail: 200,
  },
});

export const ingestionQueue = new Queue('bridge-ingestion', {
  connection: CONNECTION,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    // Ingestion uses one stable jobId per resource. Remove it immediately on
    // completion so the following scheduled scan can be enqueued.
    removeOnComplete: true,
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
    // Auto-pause saat QOSMIC down — jangan isi DLQ dengan fail berulang.
    // Probe dulu: jika health check sukses, lanjut; jika masih down, skip job sebagai 'paused' bukan 'failed'.
    if (await isQosmicBridgeDown()) {
      const probed = await probeBridgeHealth();
      if (!probed) {
        logger.warn('[Bridge] Ingest di-pause — QOSMIC masih down (auto-detect)', { tableName, batchId, jobId: job.id });
        // Reset ingestion circuit agar tidak trip karena pause
        circuitStateIngestion.consecutiveErrors = 0;
        circuitState.consecutiveErrors = 0;
        return;
      }
    }

    logger.info('[Bridge] Ingest starting', { tableName, batchId, jobId: job.id });

    const nossaClosedIncrementalDays = Math.max(
      1,
      Number.parseInt(process.env.NOSSA_CLOSED_INCREMENTAL_DAYS || '', 10) || 2,
    );
    const iterator = tableName === 'nossa'
      ? iterateNossaOpen()
      : iterateNossaClosedIncremental(nossaClosedIncrementalDays);

    const cursor: ExternalCursorDefinition = {
      idColumn: null,
      modifiedColumn: null,
      createdAtColumn: null,
      strategy: 'snapshot',
      columns: [],
    };

    try {
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
    } catch (err) {
      // Jika QOSMIC down di tengah iterasi, jangan throw sebagai failed — pause dan biarkan di-retry cycle berikut
      const isDown = await isQosmicBridgeDown().catch(() => false);
      if (isDown) {
        logger.warn('[Bridge] Ingest ter-interrupt karena QOSMIC down di tengah jalan — di-pause', {
          tableName, batchId, jobId: job.id, error: err instanceof Error ? err.message : String(err),
        });
        circuitStateIngestion.consecutiveErrors = 0;
        circuitState.consecutiveErrors = 0;
        return;
      }
      throw err;
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

async function upsertTicketRaw(
  raw: QosmicRawRow,
  sourceTable: string,
  batchId: string,
): Promise<void> {
  const cursor: ExternalCursorDefinition = {
    idColumn: null,
    modifiedColumn: null,
    createdAtColumn: null,
    strategy: 'snapshot',
    columns: [],
  };
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    retried: 0,
    errors: [],
  };

  // Every bridge write, including one-incident refresh/search/backfill,
  // goes through the same normalise → hash → conflict → full-snapshot upsert
  // pipeline as bulk ingestion. This prevents the two paths from assigning
  // conflicting meanings to syncVersion, importedAt, and NULL fields.
  await processRawRows(
    [raw as Record<string, unknown>],
    sourceTable,
    batchId,
    cursor,
    result,
  );
}

// ── Worker refs (null until startBridgeWorkers) ─────────────────────────
let workerInteractive: Worker | null = null;
let workerIngestion: Worker | null = null;
let workerBackfill: Worker | null = null;

// ── Error / Completion Hooks ─────────────────────────────────────────

function setupWorkerHooks(worker: Worker, circuit: WorkerTaskState): void {
  worker.on('completed', (job) => {
    const returnValue = job.returnvalue;
    if (returnValue && (returnValue as any).reason === 'circuit_open') return;
    circuit.consecutiveErrors = 0;
    circuit.circuitOpenedAt = null;
    circuit.lastError = null;
    // keep legacy in sync
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
      circuit.consecutiveErrors++;
      circuit.lastError = err.message;
      circuitState.consecutiveErrors = Math.max(circuitState.consecutiveErrors, circuit.consecutiveErrors);
      circuitState.lastError = err.message;
    }
  });
}

function createWorker(name: string, handler: (job: any) => Promise<any>, concurrency: number, circuit: WorkerTaskState = circuitState): Worker {
  const w = new Worker(name, handler, { connection: CONNECTION, concurrency });
  setupWorkerHooks(w, circuit);
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
      if (!shouldRunWithCircuitBreaker(circuitStateInteractive, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, 'bridge-worker')) {
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
    circuitStateInteractive,
  );

  workerIngestion = createWorker(
    'bridge-ingestion',
    async (job) => {
      if (!BRIDGE_JOB_INGESTION_ENABLED) return { skipped: true, reason: 'disabled' };

      if (!shouldRunWithCircuitBreaker(circuitStateIngestion, MAX_CONSECUTIVE_ERRORS, CIRCUIT_RESET_MS, 'bridge-worker')) {
        logger.warn('[Bridge] Circuit open, skipping job', { jobId: job.id, name: job.name });
        return { skipped: true, reason: 'circuit_open' };
      }

      switch (job.name) {
        case 'ingest-nossa':
        case 'ingest-nossa_closed':
          return handleIngestNossa(job);
        default:
          return { skipped: true, reason: 'unknown_job' };
      }
    },
    1,
    circuitStateIngestion,
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
