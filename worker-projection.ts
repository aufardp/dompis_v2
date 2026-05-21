import cron, { ScheduledTask } from 'node-cron';
import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { runProjection } from '@/lib/projection';
import { setProjectionStatus } from '@/lib/sync-metrics/metrics';
import {
  cleanupWorkerLock,
  createTaskState,
  installShutdownHandlers,
  nowWIB,
  parsePositiveInt,
  scheduleEveryMinutes,
  waitForRedisReady,
  withCancellableTimeout,
  withTaskLock,
} from '@/lib/workers/task-runner';

const WORKER_NAME = 'projection-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.PROJECTION_MAX_CONSECUTIVE_ERRORS,
  5,
);
const INTERVAL_MINUTES = parsePositiveInt(
  process.env.PROJECTION_INTERVAL_MINUTES,
  2,
);
const LOOKBACK_MINUTES = parsePositiveInt(
  process.env.PROJECTION_LOOKBACK_MINUTES,
  180,
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

  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(
      `[PROJECTION] Circuit open after ${state.consecutiveErrors} consecutive errors`,
    );
    return;
  }

  state.running = true;
  const startTime = Date.now();
  const { signal, cancel } = withCancellableTimeout(TIMEOUT_MINUTES * 60_000);

  try {
    const lockResult = await withTaskLock(
      'projection',
      LOCK_TTL_SECONDS,
      async () => {
        if (signal.aborted) return;

        const since =
          mode === 'incremental'
            ? new Date(Date.now() - LOOKBACK_MINUTES * 60_000)
            : undefined;
        const result = await runProjection(signal, { since });
        const duration = Date.now() - startTime;

        if (signal.aborted) {
          await setProjectionStatus('failed', { duration });
          return;
        }

        console.log(
          `[PROJECTION] Done | mode=${mode} | processed=${result.processed} | inserted=${result.inserted} | updated=${result.updated} | skipped=${result.skipped} | failed=${result.failed} | ${nowWIB()} WIB`,
        );

        state.consecutiveErrors = 0;
        state.lastError = null;
      },
    );

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (error: any) {
    const message = error?.message ?? String(error);
    console.error('[PROJECTION] Failed:', message);
    await setProjectionStatus('failed', { duration: Date.now() - startTime });
    state.lastError = message;
    state.consecutiveErrors++;
  } finally {
    cancel();
    state.running = false;
    state.lastRunAt = new Date();
  }
}

async function startWorker(): Promise<void> {
  console.log(
    `[${WORKER_NAME}] Starting | interval=${INTERVAL_MINUTES}m lookback=${LOOKBACK_MINUTES}m timeout=${TIMEOUT_MINUTES}m lockTtl=${LOCK_TTL_SECONDS}s fullScan=${FULL_SCAN_ENABLED ? FULL_SCAN_CRON : 'disabled'}`,
  );

  await connectDB();
  await waitForRedisReady();
  await cleanupWorkerLock('projection', TIMEOUT_MINUTES * 60_000);

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

  installShutdownHandlers(WORKER_NAME, scheduledTasks, () => state.running);

  if (RUN_ON_START) {
    void runProjectionTask('incremental');
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${WORKER_NAME}] Unhandled rejection at:`, promise, 'reason:', reason);
});

startWorker().catch((error) => {
  console.error(`[${WORKER_NAME}] Fatal startup error:`, error);
  process.exit(1);
});
