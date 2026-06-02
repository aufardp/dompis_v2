import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runStatusRefresh } from '@/lib/status-refresh';
import { getLockStatus } from '@/lib/distributed-lock';
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
import { testExternalConnection } from '@/lib/external-db/connection';
import { recordRun } from '@/lib/observability/slo-tracker';

const WORKER_NAME = 'status-refresh-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.STATUS_REFRESH_MAX_CONSECUTIVE_ERRORS,
  5,
);
const CIRCUIT_RESET_MINUTES = parsePositiveInt(
  process.env.STATUS_REFRESH_CIRCUIT_RESET_MINUTES,
  10,
);
const INTERVAL_MINUTES = parsePositiveInt(
  process.env.STATUS_REFRESH_INTERVAL_MINUTES,
  1,
);
const TIMEOUT_MINUTES = parsePositiveInt(
  process.env.STATUS_REFRESH_TIMEOUT_MINUTES,
  5,
);
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.STATUS_REFRESH_LOCK_TTL_SECONDS,
  Math.max(180, TIMEOUT_MINUTES * 60),
);
const RUN_ON_START = process.env.STATUS_REFRESH_RUN_ON_START !== 'false';
const TICKET_RAW_WRITER_LOCK_KEY = 'ticket_raw_writer';
const TICKET_RAW_WRITER_LOCK_TTL = parsePositiveInt(
  process.env.STATUS_REFRESH_TICKET_RAW_WRITER_LOCK_TTL,
  30,
);
const SCHEDULE_OFFSET = 15;

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function runStatusRefreshTask(): Promise<void> {
  if (process.env.STATUS_REFRESH_ENABLED !== 'true') {
    logger.info('Status refresh disabled');
    return;
  }

  const ingestionLock = await getLockStatus('ingestion');
  if (ingestionLock.held) {
    logger.info('Status refresh skipped because ingestion lock is held', {
      ingestionLockOwner: ingestionLock.owner,
      ingestionLockTtlMs: ingestionLock.ttlMs,
    });
    return;
  }

  if (state.running) {
    logger.info('Status refresh skipped, previous run still in progress');
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
    logger.warn('Status refresh circuit open', {
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
      'status_refresh',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        const writerLockResult = await withTaskLock(
          TICKET_RAW_WRITER_LOCK_KEY,
          TICKET_RAW_WRITER_LOCK_TTL,
          async () => {
            const result = await runStatusRefresh(signal);
            const duration = Date.now() - startTime;

            logger.info('Status refresh task complete', {
              fencingToken,
              batchId: result.batchId,
              scanned: result.scanned,
              fetched: result.fetched,
              changed: result.changed,
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

        if (writerLockResult === 'skipped') {
          logger.info('Status refresh skipped because ticket_raw writer lock is held');
        }
      },
      { abortController: controller },
    );

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Status refresh task failed', error, {
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
  logger.info('Status refresh worker starting', {
    interval: `${INTERVAL_MINUTES}m`,
    timeout: `${TIMEOUT_MINUTES}m`,
    lockTtl: `${LOCK_TTL_SECONDS}s`,
    offset: `${SCHEDULE_OFFSET}s`,
  });

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  await waitForRedisReady();
  await forceCleanupLock('status_refresh');
  await forceCleanupLock(TICKET_RAW_WRITER_LOCK_KEY);
  await cleanupWorkerLock('status_refresh', TIMEOUT_MINUTES * 60_000);
  await cleanupWorkerLock(TICKET_RAW_WRITER_LOCK_KEY, TICKET_RAW_WRITER_LOCK_TTL * 1000);
  await testExternalConnection();
  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => runWithCorrelationContext(WORKER_NAME, () => void runStatusRefreshTask()), 'status-refresh', SCHEDULE_OFFSET, { maxIntervalMinutes: 5, idleThreshold: 3 }),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    runWithCorrelationContext(WORKER_NAME, () => void runStatusRefreshTask());
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
