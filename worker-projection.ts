import cron from 'node-cron';
import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { runFullScanProjection, runProjection } from '@/lib/projection';
import { redis, isRedisReady } from '@/lib/redis';
import { flushProjectionEffects } from '@/lib/projection/effects';
import { isRevisionSyncEnabled } from '@/lib/ingestion/sync-state';
import { PROJECTION_REQUEST_CHANNEL } from '@/lib/worker-signals';
import { setProjectionStatus } from '@/lib/sync-metrics/metrics';
import { testExternalConnection } from '@/lib/external-db/connection';
import {
  cleanupWorkerLock,
  createTaskState,
  forceCleanupLock,
  installShutdownHandlers,
  nowWIB,
  parsePositiveInt,
  runWithCorrelationContext,
  scheduleEveryMinutes,
  type ScheduledTaskHandle,
  shouldRunWithCircuitBreaker,
  startWorkerHeartbeat,
  waitForRedisReady,
  waitStartupDelay,
  withCancellableTimeout,
  withTaskLock,
} from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';
import { logConfigWarnings } from '@/lib/observability/config-validator';
import { recordRun } from '@/lib/observability/slo-tracker';

const WORKER_NAME = 'projection-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.PROJECTION_MAX_CONSECUTIVE_ERRORS,
  5,
);
const CIRCUIT_RESET_MINUTES = parsePositiveInt(
  process.env.PROJECTION_CIRCUIT_RESET_MINUTES,
  10,
);
const INTERVAL_MINUTES = parsePositiveInt(
  process.env.PROJECTION_INTERVAL_MINUTES,
  2,
);
const TIMEOUT_MINUTES = parsePositiveInt(
  process.env.PROJECTION_TIMEOUT_MINUTES,
  30,
);
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.PROJECTION_LOCK_TTL_SECONDS,
  Math.max(300, TIMEOUT_MINUTES * 60),
);
const FULL_SCAN_CRON = process.env.PROJECTION_FULL_SCAN_CRON || '0 2 * * *';
const FULL_SCAN_ENABLED = process.env.PROJECTION_FULL_SCAN_ENABLED !== 'false';
const RUN_ON_START = process.env.PROJECTION_RUN_ON_START !== 'false';
const SCHEDULE_OFFSET = 30;
const RUN_BUDGET_MS = parsePositiveInt(process.env.PROJECTION_RUN_BUDGET_MS, 30_000);

const state = createTaskState();
const scheduledTasks: ScheduledTaskHandle[] = [];
let projectionRequestSubscriber: ReturnType<typeof redis.duplicate> | null = null;
let pendingProjectionRun = false;
let projectionPumpActive = false;
const freshBatches = new Map<string, { importedAt: Date; ticketRawId: string } | undefined>();

async function collectPendingProjectionRequests(): Promise<Array<{ id: bigint; syncBatchId: string | null }>> {
  try {
    const pending = await prisma.projection_request.findMany({
      where: { processedAt: null },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true, syncBatchId: true },
    });
    if (pending.length === 0) return [];
    return pending;
  } catch (error) {
    logger.warn('Failed to inspect projection requests:', { error: String(error) });
    return [];
  }
}

async function acknowledgeProjectionRequests(ids: bigint[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await prisma.projection_request.updateMany({
      where: { id: { in: ids } },
      data: { processedAt: new Date() },
    });
    logger.info('Acknowledged projection requests in DB queue:', { count: ids.length });
  } catch (error) {
    logger.warn('Failed to acknowledge projection requests:', { error: String(error) });
  }
}

function queueIncrementalProjectionRun(source: string): void {
  pendingProjectionRun = true;
  if (projectionPumpActive || state.running) return;

  void drainProjectionQueue(source);
}

async function drainProjectionQueue(source: string): Promise<void> {
  if (projectionPumpActive) return;
  projectionPumpActive = true;

  try {
    while (pendingProjectionRun) {
      pendingProjectionRun = false;
      logger.info('Projection queue draining', {
        source,
      });
      await runProjectionTask('incremental');
      if (pendingProjectionRun) await new Promise(resolve => setTimeout(resolve, 250));
    }
  } finally {
    projectionPumpActive = false;
  }
}

async function withProjectionLock(fn: Parameters<typeof withTaskLock>[2], controller: AbortController) {
  if (isRevisionSyncEnabled()) {
    await fn({ ownerId: 'mysql', fencingToken: 0, correlationId: WORKER_NAME });
    return 'acquired' as const;
  }
  return withTaskLock('projection', LOCK_TTL_SECONDS, fn, { abortController: controller });
}

let pendingPollActive = false;
async function pollPendingProjection(): Promise<void> {
  if (pendingPollActive || state.running || projectionPumpActive) return;
  pendingPollActive = true;
  try {
    const pending = await prisma.ticket_sync_state.findFirst({
      where: { pending: true, nextAttemptAt: { lte: new Date() } }, select: { incident: true },
    });
    if (pending) queueIncrementalProjectionRun('pending-poll');
    else if (isRedisReady()) await flushProjectionEffects();
  } catch (error) {
    logger.warn('Pending projection poll failed', { error: String(error) });
  } finally {
    pendingPollActive = false;
  }
}

async function runProjectionTask(mode: 'incremental' | 'full'): Promise<void> {
  if (process.env.PROJECTION_ENABLED !== 'true') {
    logger.info('Projection disabled');
    return;
  }

  if (state.running) {
    logger.info('Projection skipped, previous run still in progress');
    return;
  }

  if (
    !shouldRunWithCircuitBreaker(
      state,
      MAX_CONSECUTIVE_ERRORS,
      CIRCUIT_RESET_MINUTES * 60_000,
      WORKER_NAME,
    )
  ) {
    logger.warn('Projection circuit open', {
      consecutiveErrors: state.consecutiveErrors,
      resetMinutes: CIRCUIT_RESET_MINUTES,
    });
    return;
  }

  state.running = true;
  const startTime = Date.now();
  const { controller, signal, cancel } = withCancellableTimeout(TIMEOUT_MINUTES * 60_000);
  state.abortController = controller;
  const requests = await collectPendingProjectionRequests();

  try {
    const lockResult = await withProjectionLock(
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        if (!isRevisionSyncEnabled() && mode === 'incremental') {
          for (const request of requests) {
            if (request.syncBatchId && !freshBatches.has(request.syncBatchId) && freshBatches.size < 100) {
              freshBatches.set(request.syncBatchId, undefined);
            }
          }
          const batchId = freshBatches.keys().next().value;
          if (batchId) {
            try {
              const freshResult = await runProjection(signal, {
                mode: 'batch', syncBatchId: batchId, preserveCheckpointCursor: true,
                skipAutoRepair: true, maxDurationMs: RUN_BUDGET_MS, after: freshBatches.get(batchId),
              });
              freshBatches.delete(batchId);
              if (freshResult.continuation) freshBatches.set(batchId, freshResult.continuation);
              else if (freshResult.failed === 0) {
                await acknowledgeProjectionRequests(requests.filter(request => request.syncBatchId === batchId).map(request => request.id));
              }
              logger.info('Projection fresh batch slice complete', {
                batchId, processed: freshResult.processed, failed: freshResult.failed,
                hasMore: Boolean(freshResult.continuation),
              });
            } catch (error) {
              if (signal.aborted) throw error;
              freshBatches.delete(batchId);
              logger.warn('Projection fresh batch deferred to a later run', {
                batchId, error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        const result =
          mode === 'full'
            ? await runFullScanProjection(signal)
            : await runProjection(signal, { mode: 'incremental', maxDurationMs: RUN_BUDGET_MS });
        const duration = Date.now() - startTime;

        if (signal.aborted) {
          await setProjectionStatus('failed', { duration });
          return;
        }

        logger.info('Projection task complete', {
          task: mode,
          fencingToken,
          processed: result.processed,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
          retried: result.retried,
          protected: result.protected,
          durationMs: duration,
          checkpoint: result.checkpoint,
          hasMore: Boolean(result.continuation),
          time: nowWIB(),
        });
        if (!result.continuation && result.failed === 0) {
          await acknowledgeProjectionRequests(requests
            .filter(request => isRevisionSyncEnabled() || !request.syncBatchId)
            .map(request => request.id));
          if (isRevisionSyncEnabled()) freshBatches.clear();
        }
        if (result.continuation || freshBatches.size > 0) pendingProjectionRun = true;
        await recordRun(WORKER_NAME, duration, result.failed === 0, {
          processed: result.processed,
        });

        state.consecutiveErrors = 0;
        state.circuitOpenedAt = null;
        state.lastError = null;
      },
      controller,
    );

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Projection task failed', error, {
      task: mode,
      durationMs: Date.now() - startTime,
    });
    await setProjectionStatus('failed', { duration: Date.now() - startTime });
    await recordRun(WORKER_NAME, Date.now() - startTime, false, { error: message });
    state.lastError = message;
    state.consecutiveErrors++;
    if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      state.circuitOpenedAt = new Date();
    }
  } finally {
    cancel();
    state.running = false;
    state.lastRunAt = new Date();
    state.abortController = null;
    if (pendingProjectionRun && !projectionPumpActive) {
      void drainProjectionQueue('post-run');
    }
  }
}

async function subscribeProjectionRequests(): Promise<void> {
  const subscriber = redis.duplicate({
    lazyConnect: true,
    enableOfflineQueue: true,
  });
  projectionRequestSubscriber = subscriber;

  subscriber.on('error', (error) => {
    logger.error('Projection request subscriber error', error, {});
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== PROJECTION_REQUEST_CHANNEL) return;
    let syncBatchId: string | undefined;
    try {
      const payload = JSON.parse(message);
      if (typeof payload?.syncBatchId === 'string' && payload.syncBatchId.length <= 100) {
        syncBatchId = payload.syncBatchId;
        if (syncBatchId && !freshBatches.has(syncBatchId) && freshBatches.size < 100) freshBatches.set(syncBatchId, undefined);
      }
    } catch {}
    logger.info('Projection requested by ingestion signal', { syncBatchId });
    runWithCorrelationContext(WORKER_NAME, () =>
      queueIncrementalProjectionRun('pubsub'),
    );
  });

  await subscriber.connect();
  await subscriber.subscribe(PROJECTION_REQUEST_CHANNEL);
  logger.info('Projection request subscriber ready', {
    channel: PROJECTION_REQUEST_CHANNEL,
  });
}

async function startWorker(): Promise<void> {
  logger.info('Projection worker starting', {
    interval: `${INTERVAL_MINUTES}m`,
    timeout: `${TIMEOUT_MINUTES}m`,
    runBudgetMs: RUN_BUDGET_MS,
    lockTtl: `${LOCK_TTL_SECONDS}s`,
    fullScan: FULL_SCAN_ENABLED ? FULL_SCAN_CRON : 'disabled',
    offset: `${SCHEDULE_OFFSET}s`,
  });

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  if (!isRevisionSyncEnabled()) await waitForRedisReady();
  await forceCleanupLock('projection');
  await cleanupWorkerLock('projection', TIMEOUT_MINUTES * 60_000);
  if (!isRevisionSyncEnabled()) await testExternalConnection();
  // Opsi B: bersihkan backlog active-refresh yang stale (79981) karena worker sudah disabled
  try {
    if (isRedisReady()) {
      await redis.del('active-refresh:backlog');
      await redis.del('active-refresh:metrics');
    }
  } catch {}
  startWorkerHeartbeat(WORKER_NAME, state);
  const subscribe = subscribeProjectionRequests().catch((error) => {
    logger.error('Projection request subscriber disabled; interval fallback remains active', error, {});
  });
  if (!isRevisionSyncEnabled()) await subscribe;

  if (isRevisionSyncEnabled()) {
    const poll = setInterval(() => void pollPendingProjection(), 1000);
    scheduledTasks.push({ stop: () => clearInterval(poll) });
  }

  scheduledTasks.push(
    scheduleEveryMinutes(
      INTERVAL_MINUTES,
      () =>
        runWithCorrelationContext(WORKER_NAME, () =>
          queueIncrementalProjectionRun('interval'),
        ),
      'projection',
      SCHEDULE_OFFSET,
      { maxIntervalMinutes: 1, idleThreshold: 0 },
    ),
  );
  if (FULL_SCAN_ENABLED) {
    scheduledTasks.push(
      cron.schedule(FULL_SCAN_CRON, () => runWithCorrelationContext(WORKER_NAME, () => void runProjectionTask('full'))),
    );
  }

  // Opsi B: active-refresh dihapus total — midnight resetStaleAssigned dipindah ke sini (1×/hari, bukan per-menit)
  // Ganti 2.8M UPDATE/hari dengan 1 batch 500/hari
  scheduledTasks.push(
    cron.schedule('0 0 * * *', () =>
      runWithCorrelationContext(WORKER_NAME, async () => {
        try {
          const { resetAllStaleAssignedTickets } = await import('@/lib/active-refresh');
          const count = await resetAllStaleAssignedTickets();
          if (count > 0) logger.info('[Projection] Midnight reset stale assigned', { count });
        } catch (e) {
          logger.warn('[Projection] Midnight reset failed', { error: String(e) });
        }
      }),
    ),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    runWithCorrelationContext(WORKER_NAME, () =>
      queueIncrementalProjectionRun('startup'),
    );
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection, exiting', reason, { worker: WORKER_NAME, promise: String(promise) });
  process.exit(1);
});

process.on('exit', () => {
  projectionRequestSubscriber?.disconnect();
});

startWorker().catch((error) => {
  logger.error(`[${WORKER_NAME}] Fatal startup error:`, { error: String(error) });
  process.exit(1);
});
