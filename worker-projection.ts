import cron from 'node-cron';
import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runFullScanProjection, runProjection } from '@/lib/projection';
import { redis } from '@/lib/redis';
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

const state = createTaskState();
const scheduledTasks: ScheduledTaskHandle[] = [];
let projectionRequestSubscriber: ReturnType<typeof redis.duplicate> | null = null;
let pendingProjectionRun = false;
let projectionPumpActive = false;

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
    }
  } finally {
    projectionPumpActive = false;
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
          time: nowWIB(),
        });
        await recordRun(WORKER_NAME, duration, true, {
          processed: result.processed,
        });

        state.consecutiveErrors = 0;
        state.circuitOpenedAt = null;
        state.lastError = null;
      },
      { abortController: controller },
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
    logger.info('Projection requested by ingestion signal', { message });
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
    lockTtl: `${LOCK_TTL_SECONDS}s`,
    fullScan: FULL_SCAN_ENABLED ? FULL_SCAN_CRON : 'disabled',
    offset: `${SCHEDULE_OFFSET}s`,
  });

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  await waitForRedisReady();
  await forceCleanupLock('projection');
  await cleanupWorkerLock('projection', TIMEOUT_MINUTES * 60_000);
  await testExternalConnection();
  startWorkerHeartbeat(WORKER_NAME, state);
  await subscribeProjectionRequests().catch((error) => {
    logger.error('Projection request subscriber disabled; interval fallback remains active', error, {});
  });

  scheduledTasks.push(
    scheduleEveryMinutes(
      INTERVAL_MINUTES,
      () =>
        runWithCorrelationContext(WORKER_NAME, () =>
          queueIncrementalProjectionRun('interval'),
        ),
      'projection',
      SCHEDULE_OFFSET,
      { maxIntervalMinutes: 10, idleThreshold: 5 },
    ),
  );
  if (FULL_SCAN_ENABLED) {
    scheduledTasks.push(
      cron.schedule(FULL_SCAN_CRON, () => runWithCorrelationContext(WORKER_NAME, () => void runProjectionTask('full'))),
    );
  }

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
