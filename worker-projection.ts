import cron, { ScheduledTask } from 'node-cron';
import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runFullScanProjection, runProjection } from '@/lib/projection';
import { redis } from '@/lib/redis';
import { setProjectionStatus } from '@/lib/sync-metrics/metrics';
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

const WORKER_NAME = 'projection-worker';
const PROJECTION_REQUEST_CHANNEL = 'worker:projection:request';
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

const state = createTaskState();
const scheduledTasks: ScheduledTask[] = [];

async function runProjectionTask(mode: 'incremental' | 'full'): Promise<void> {
  if (process.env.PROJECTION_ENABLED !== 'true') {
    console.log('[PROJECTION] Disabled');
    return;
  }

  if (state.running) {
    console.log('[PROJECTION] Skipped, previous run still in progress');
    return;
  }

  if (
    !shouldRunWithCircuitBreaker(
      state,
      MAX_CONSECUTIVE_ERRORS,
      CIRCUIT_RESET_MINUTES * 60_000,
    )
  ) {
    logger.warn('Projection circuit open', {
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
  const correlationId = createCorrelationId(`projection-${mode}`);

  try {
    const lockResult = await withTaskLock(
      'projection',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        const result =
          mode === 'full'
            ? await runFullScanProjection(signal)
            : await runProjection(signal, { mode: 'incremental' });
        const duration = Date.now() - startTime;

        if (signal.aborted) {
          await setProjectionStatus('failed', { duration });
          return;
        }

        console.log(
          `[PROJECTION] Done | mode=${mode} | processed=${result.processed} | inserted=${result.inserted} | updated=${result.updated} | skipped=${result.skipped} | failed=${result.failed} | ${nowWIB()} WIB`,
        );
        logger.info('Projection task complete', {
          worker: WORKER_NAME,
          task: mode,
          correlationId,
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
    logger.error('Projection task failed', error, {
      worker: WORKER_NAME,
      task: mode,
      correlationId,
      durationMs: Date.now() - startTime,
    });
    await setProjectionStatus('failed', { duration: Date.now() - startTime });
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

async function subscribeProjectionRequests(): Promise<void> {
  const subscriber = redis.duplicate();

  subscriber.on('error', (error) => {
    logger.error('Projection request subscriber error', error, {
      worker: WORKER_NAME,
    });
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== PROJECTION_REQUEST_CHANNEL) return;
    logger.info('Projection requested by ingestion signal', {
      worker: WORKER_NAME,
      message,
    });
    void runProjectionTask('incremental');
  });

  await subscriber.subscribe(PROJECTION_REQUEST_CHANNEL);
  logger.info('Projection request subscriber ready', {
    worker: WORKER_NAME,
    channel: PROJECTION_REQUEST_CHANNEL,
  });
}

async function startWorker(): Promise<void> {
  console.log(
    `[${WORKER_NAME}] Starting | interval=${INTERVAL_MINUTES}m timeout=${TIMEOUT_MINUTES}m lockTtl=${LOCK_TTL_SECONDS}s fullScan=${FULL_SCAN_ENABLED ? FULL_SCAN_CRON : 'disabled'}`,
  );

  await connectDB();
  await waitForRedisReady();
  await cleanupWorkerLock('projection', TIMEOUT_MINUTES * 60_000);
  startWorkerHeartbeat(WORKER_NAME, state);
  await subscribeProjectionRequests();

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () =>
      void runProjectionTask('incremental'),
    ),
  );
  if (FULL_SCAN_ENABLED) {
    scheduledTasks.push(
      cron.schedule(FULL_SCAN_CRON, () => void runProjectionTask('full')),
    );
  }

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    void runProjectionTask('incremental');
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason, { worker: WORKER_NAME, promise: String(promise) });
});

startWorker().catch((error) => {
  console.error(`[${WORKER_NAME}] Fatal startup error:`, error);
  process.exit(1);
});
