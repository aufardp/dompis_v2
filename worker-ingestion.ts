import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runIngestion } from '@/lib/ingestion';
import { setSyncStatus } from '@/lib/sync-metrics/metrics';
import {
  cleanupWorkerLock,
  createTaskState,
  installShutdownHandlers,
  nowWIB,
  parsePositiveInt,
  scheduleEveryMinutes,
  shouldRunWithCircuitBreaker,
  startWorkerHeartbeat,
  waitForRedisReady,
  withCancellableTimeout,
  withTaskLock,
} from '@/lib/workers/task-runner';
import { createCorrelationId, logger } from '@/lib/observability/logger';

const WORKER_NAME = 'ingestion-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.INGESTION_MAX_CONSECUTIVE_ERRORS,
  5,
);
const CIRCUIT_RESET_MINUTES = parsePositiveInt(
  process.env.INGESTION_CIRCUIT_RESET_MINUTES,
  10,
);
const INTERVAL_MINUTES = parsePositiveInt(
  process.env.INGESTION_INTERVAL_MINUTES,
  5,
);
const TIMEOUT_MINUTES = parsePositiveInt(
  process.env.INGESTION_TIMEOUT_MINUTES,
  30,
);
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.INGESTION_LOCK_TTL_SECONDS,
  Math.max(300, TIMEOUT_MINUTES * 60),
);
const RUN_ON_START = process.env.INGESTION_RUN_ON_START !== 'false';

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function runIngestionTask(): Promise<void> {
  if (process.env.INGESTION_ENABLED !== 'true') {
    console.log('[INGESTION] Disabled');
    return;
  }

  if (state.running) {
    console.log('[INGESTION] Skipped, previous run still in progress');
    return;
  }

  if (
    !shouldRunWithCircuitBreaker(
      state,
      MAX_CONSECUTIVE_ERRORS,
      CIRCUIT_RESET_MINUTES * 60_000,
    )
  ) {
    logger.warn('Ingestion circuit open', {
      worker: WORKER_NAME,
      consecutiveErrors: state.consecutiveErrors,
      resetMinutes: CIRCUIT_RESET_MINUTES,
    });
    return;
  }

  state.running = true;
  const startTime = Date.now();
  const { controller, signal, cancel } = withCancellableTimeout(TIMEOUT_MINUTES * 60_000);
  state.abortController = controller;
  const correlationId = createCorrelationId('ingestion');

  try {
    const lockResult = await withTaskLock(
      'ingestion',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        const result = await runIngestion(signal);
        const duration = Date.now() - startTime;

        if (signal.aborted) {
          await setSyncStatus('failed', { duration });
          return;
        }

        console.log(
          `[INGESTION] Done | batch=${result.syncBatchId ?? '-'} | inserted=${result.inserted} | updated=${result.updated} | skipped=${result.skipped} | failed=${result.failed} | ${nowWIB()} WIB`,
        );
        logger.info('Ingestion task complete', {
          worker: WORKER_NAME,
          correlationId,
          fencingToken,
          batchId: result.syncBatchId,
          processed: result.processed,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
          quarantined: result.quarantined,
          retried: result.retried,
          durationMs: duration,
        });

        state.consecutiveErrors = 0;
        state.circuitOpenedAt = null;
        state.lastError = null;
      },
      { abortController: controller, correlationId },
    );

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Ingestion task failed', error, {
      worker: WORKER_NAME,
      correlationId,
      durationMs: Date.now() - startTime,
    });
    await setSyncStatus('failed', { duration: Date.now() - startTime });
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
  }
}

async function startWorker(): Promise<void> {
  console.log(
    `[${WORKER_NAME}] Starting | interval=${INTERVAL_MINUTES}m timeout=${TIMEOUT_MINUTES}m lockTtl=${LOCK_TTL_SECONDS}s`,
  );

  await connectDB();
  await waitForRedisReady();
  await cleanupWorkerLock('ingestion', TIMEOUT_MINUTES * 60_000);
  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => void runIngestionTask()),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    void runIngestionTask();
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason, { worker: WORKER_NAME, promise: String(promise) });
});

startWorker().catch((error) => {
  console.error(`[${WORKER_NAME}] Fatal startup error:`, error);
  process.exit(1);
});
