import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { runIngestion } from '@/lib/ingestion';
import { isRedisReady, redis } from '@/lib/redis';
import { PROJECTION_REQUEST_CHANNEL } from '@/lib/worker-signals';
import { setSyncStatus } from '@/lib/sync-metrics/metrics';
import {
  cleanupWorkerLock,
  createTaskState,
  forceCleanupLock,
  installShutdownHandlers,
  nowWIB,
  parsePositiveInt,
  runWithCorrelationContext,
  scheduleEveryMinutes,
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
import { testExternalConnection } from '@/lib/external-db/connection';

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
const TICKET_RAW_WRITER_LOCK_KEY = 'ticket_raw_writer';
const SCHEDULE_OFFSET = 0;

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function requestImmediateProjection(syncBatchId?: string | null): Promise<void> {
  if (process.env.INGESTION_TRIGGER_PROJECTION === 'false') return;

  try {
    await prisma.projection_request.create({
      data: {
        source: WORKER_NAME,
        syncBatchId: syncBatchId ?? undefined,
      },
    });
  } catch (dbError) {
    logger.warn('Projection request DB insert failed', {
      batchId: syncBatchId,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
  }

  if (!isRedisReady()) {
    logger.warn('Projection Redis signal skipped — DB fallback active', {
      batchId: syncBatchId,
    });
    return;
  }

  try {
    await redis.publish(
      PROJECTION_REQUEST_CHANNEL,
      JSON.stringify({
        source: WORKER_NAME,
        syncBatchId,
        requestedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    logger.warn('Projection trigger publish failed', {
      batchId: syncBatchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runIngestionTask(): Promise<void> {
  if (process.env.INGESTION_ENABLED !== 'true') {
    logger.info('Ingestion disabled');
    return;
  }

  if (state.running) {
    logger.info('Ingestion skipped, previous run still in progress');
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
    logger.warn('Ingestion circuit open', {
      consecutiveErrors: state.consecutiveErrors,
      resetMinutes: CIRCUIT_RESET_MINUTES,
    });
    return;
  }

  state.running = true;
  const startTime = Date.now();
  const { controller, signal, cancel } = withCancellableTimeout(TIMEOUT_MINUTES * 60_000);
  state.abortController = controller;

  try {
    const lockResult = await withTaskLock(
      'ingestion',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;
        const writerLockResult = await withTaskLock(
          TICKET_RAW_WRITER_LOCK_KEY,
          LOCK_TTL_SECONDS,
          async () => {
            const result = await runIngestion(signal);
            const duration = Date.now() - startTime;

            if (signal.aborted) {
              await setSyncStatus('failed', { duration });
              return;
            }

            logger.info('Ingestion task complete', {
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
              time: nowWIB(),
            });
            await requestImmediateProjection(result.syncBatchId);
            await recordRun(WORKER_NAME, duration, true, {
              processed: result.processed,
              quarantined: result.quarantined,
            });

            state.consecutiveErrors = 0;
            state.circuitOpenedAt = null;
            state.lastError = null;
          },
          { abortController: controller },
        );
        const duration = Date.now() - startTime;

        if (writerLockResult === 'skipped') {
          logger.info('Ingestion skipped because ticket_raw writer lock is held', {
            durationMs: duration,
          });
          return;
        }
      },
      { abortController: controller },
    );

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Ingestion task failed', error, {
      durationMs: Date.now() - startTime,
    });
    await setSyncStatus('failed', { duration: Date.now() - startTime });
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
  }
}

async function startWorker(): Promise<void> {
  logger.info('Ingestion worker starting', {
    interval: `${INTERVAL_MINUTES}m`,
    timeout: `${TIMEOUT_MINUTES}m`,
    lockTtl: `${LOCK_TTL_SECONDS}s`,
    offset: `${SCHEDULE_OFFSET}s`,
  });

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  await waitForRedisReady();
  await forceCleanupLock('ingestion');
  await forceCleanupLock(TICKET_RAW_WRITER_LOCK_KEY);
  await cleanupWorkerLock('ingestion', TIMEOUT_MINUTES * 60_000);
  await cleanupWorkerLock(TICKET_RAW_WRITER_LOCK_KEY, TIMEOUT_MINUTES * 60_000);
  await testExternalConnection();
  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => runWithCorrelationContext(WORKER_NAME, () => void runIngestionTask()), 'ingestion', SCHEDULE_OFFSET, { maxIntervalMinutes: 15, idleThreshold: 10 }),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    runWithCorrelationContext(WORKER_NAME, () => void runIngestionTask());
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection, exiting', reason, { worker: WORKER_NAME, promise: String(promise) });
  process.exit(1);
});

startWorker().catch((error) => {
  logger.error(`[${WORKER_NAME}] Fatal startup error:`, { error: String(error) });
  process.exit(1);
});
