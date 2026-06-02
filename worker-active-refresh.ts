import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runActiveRefresh } from '@/lib/active-refresh';
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

const WORKER_NAME = 'active-refresh-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.ACTIVE_REFRESH_MAX_CONSECUTIVE_ERRORS,
  5,
);
const CIRCUIT_RESET_MINUTES = parsePositiveInt(
  process.env.ACTIVE_REFRESH_CIRCUIT_RESET_MINUTES,
  10,
);
const INTERVAL_MINUTES = parsePositiveInt(
  process.env.ACTIVE_REFRESH_INTERVAL_MINUTES,
  10,
);
const TIMEOUT_MINUTES = parsePositiveInt(
  process.env.ACTIVE_REFRESH_TIMEOUT_MINUTES,
  10,
);
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.ACTIVE_REFRESH_LOCK_TTL_SECONDS,
  Math.max(300, TIMEOUT_MINUTES * 60),
);
const RUN_ON_START = process.env.ACTIVE_REFRESH_RUN_ON_START !== 'false';
const SCHEDULE_OFFSET = 45;

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function runActiveRefreshTask(): Promise<void> {
  if (process.env.ACTIVE_REFRESH_ENABLED !== 'true') {
    logger.info('Active refresh disabled');
    return;
  }

  if (state.running) {
    logger.info('Active refresh skipped, previous run still in progress');
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
    logger.warn('Active refresh circuit open', {
      consecutiveErrors: state.consecutiveErrors,
      resetMinutes: CIRCUIT_RESET_MINUTES,
    });
    return;
  }

  state.running = true;
  const startTime = Date.now();
  const { controller, signal, cancel } = withCancellableTimeout(
    TIMEOUT_MINUTES * 60_000,
  );
  state.abortController = controller;

  try {
    const lockResult = await withTaskLock(
      'active_refresh',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        const result = await runActiveRefresh(signal);
        const duration = Date.now() - startTime;

        logger.info('Active refresh task complete', {
          fencingToken,
          batchId: result.batchId,
          scanned: result.scanned,
          updated: result.updated,
          durationMs: duration,
          time: nowWIB(),
        });
        await recordRun(WORKER_NAME, duration, true, {
          processed: result.scanned,
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
    logger.error('Active refresh task failed', error, {
      durationMs: Date.now() - startTime,
    });
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
  logger.info('Active refresh worker starting', {
    interval: `${INTERVAL_MINUTES}m`,
    timeout: `${TIMEOUT_MINUTES}m`,
    lockTtl: `${LOCK_TTL_SECONDS}s`,
    offset: `${SCHEDULE_OFFSET}s`,
  });

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  await waitForRedisReady();
  await forceCleanupLock('active_refresh');
  await cleanupWorkerLock('active_refresh', TIMEOUT_MINUTES * 60_000);
  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => runWithCorrelationContext(WORKER_NAME, () => void runActiveRefreshTask()), 'active-refresh', SCHEDULE_OFFSET, { maxIntervalMinutes: 30, idleThreshold: 5 }),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    runWithCorrelationContext(WORKER_NAME, () => void runActiveRefreshTask());
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection, exiting', reason, { promise: String(promise) });
  process.exit(1);
});

startWorker().catch((error) => {
  logger.error('Fatal startup error', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});
