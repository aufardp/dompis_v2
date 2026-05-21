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
  waitForRedisReady,
  withCancellableTimeout,
  withTaskLock,
} from '@/lib/workers/task-runner';

const WORKER_NAME = 'ingestion-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.INGESTION_MAX_CONSECUTIVE_ERRORS,
  5,
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

  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(
      `[INGESTION] Circuit open after ${state.consecutiveErrors} consecutive errors`,
    );
    return;
  }

  state.running = true;
  const startTime = Date.now();
  const { signal, cancel } = withCancellableTimeout(TIMEOUT_MINUTES * 60_000);

  try {
    const lockResult = await withTaskLock(
      'ingestion',
      LOCK_TTL_SECONDS,
      async () => {
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

        state.consecutiveErrors = 0;
        state.lastError = null;
      },
    );

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (error: any) {
    const message = error?.message ?? String(error);
    console.error('[INGESTION] Failed:', message);
    await setSyncStatus('failed', { duration: Date.now() - startTime });
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
    `[${WORKER_NAME}] Starting | interval=${INTERVAL_MINUTES}m timeout=${TIMEOUT_MINUTES}m lockTtl=${LOCK_TTL_SECONDS}s`,
  );

  await connectDB();
  await waitForRedisReady();
  await cleanupWorkerLock('ingestion', TIMEOUT_MINUTES * 60_000);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => void runIngestionTask()),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, () => state.running);

  if (RUN_ON_START) {
    void runIngestionTask();
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${WORKER_NAME}] Unhandled rejection at:`, promise, 'reason:', reason);
});

startWorker().catch((error) => {
  console.error(`[${WORKER_NAME}] Fatal startup error:`, error);
  process.exit(1);
});
