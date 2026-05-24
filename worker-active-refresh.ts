import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runActiveRefresh } from '@/lib/active-refresh';
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

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function runActiveRefreshTask(): Promise<void> {
  if (process.env.ACTIVE_REFRESH_ENABLED !== 'true') {
    console.log('[ACTIVE-REFRESH] Disabled');
    return;
  }

  if (state.running) {
    console.log('[ACTIVE-REFRESH] Skipped, previous run still in progress');
    return;
  }

  if (
    !shouldRunWithCircuitBreaker(
      state,
      MAX_CONSECUTIVE_ERRORS,
      CIRCUIT_RESET_MINUTES * 60_000,
    )
  ) {
    logger.warn('Active refresh circuit open', {
      worker: WORKER_NAME,
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
  const correlationId = createCorrelationId('active-refresh');

  try {
    const lockResult = await withTaskLock(
      'active_refresh',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        const result = await runActiveRefresh(signal);
        const duration = Date.now() - startTime;

        console.log(
          `[ACTIVE-REFRESH] Done | batch=${result.batchId} | scanned=${result.scanned} | updated=${result.updated} | ${nowWIB()} WIB`,
        );
        logger.info('Active refresh task complete', {
          worker: WORKER_NAME,
          correlationId,
          fencingToken,
          batchId: result.batchId,
          scanned: result.scanned,
          updated: result.updated,
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
    logger.error('Active refresh task failed', error, {
      worker: WORKER_NAME,
      correlationId,
      durationMs: Date.now() - startTime,
    });
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
  await cleanupWorkerLock('active_refresh', TIMEOUT_MINUTES * 60_000);
  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => void runActiveRefreshTask()),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    void runActiveRefreshTask();
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason, {
    worker: WORKER_NAME,
    promise: String(promise),
  });
});

startWorker().catch((error) => {
  console.error(`[${WORKER_NAME}] Fatal startup error:`, error);
  process.exit(1);
});

