import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import {
  createTaskState,
  installShutdownHandlers,
  runWithCorrelationContext,
  scheduleEveryMinutes,
  startWorkerHeartbeat,
  waitForRedisReady,
  waitStartupDelay,
} from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';
import { recomputeTodaySnapshot } from '@/lib/aggregation/summary-snapshot';

const WORKER_NAME = 'snapshot-worker';
const INTERVAL_SECONDS = parseInt(process.env.SNAPSHOT_INTERVAL_SECONDS ?? '60', 10);
const RUN_ON_START = process.env.SNAPSHOT_RUN_ON_START !== 'false';

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function runSnapshotTask(): Promise<void> {
  if (state.running) return;
  state.running = true;
  const startedAt = Date.now();

  try {
    const updated = await recomputeTodaySnapshot();
    state.lastRunAt = new Date();
    state.lastError = null;
    state.consecutiveErrors = 0;
    state.circuitOpenedAt = null;
    logger.info('Snapshot updated', { rows: updated, elapsed: Date.now() - startedAt });
  } catch (error) {
    state.lastRunAt = new Date();
    state.lastError = String(error);
    state.consecutiveErrors++;
    logger.error('Snapshot task failed', { error: String(error) });
  } finally {
    state.running = false;
  }
}

async function startWorker(): Promise<void> {
  logger.info('Snapshot worker starting', { interval: `${INTERVAL_SECONDS}s` });

  await waitStartupDelay();
  await connectDB();
  await waitForRedisReady();

  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(
      INTERVAL_SECONDS / 60,
      () => runWithCorrelationContext(WORKER_NAME, () => void runSnapshotTask()),
      'snapshot',
      0,
      { maxIntervalMinutes: 5, idleThreshold: 5 },
    ),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state);

  if (RUN_ON_START) {
    runWithCorrelationContext(WORKER_NAME, () => void runSnapshotTask());
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
