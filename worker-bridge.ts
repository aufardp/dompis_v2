import 'dotenv/config';
import { connectDB } from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';
import { logConfigWarnings } from '@/lib/observability/config-validator';
import {
  createTaskState,
  installShutdownHandlers,
  runWithCorrelationContext,
  scheduleEveryMinutes,
  startWorkerHeartbeat,
  waitForRedisReady,
  waitStartupDelay,
} from '@/lib/workers/task-runner';
import {
  startBridgeWorkers,
  stopBridgeWorkers,
  getDLQCounts,
  getBridgeCircuitState,
} from '@/lib/external-db/qosmic-bridge/bridge-queue';
import { isQosmicBridgeDown, probeBridgeHealth } from '@/lib/external-db/qosmic-bridge/client';

const WORKER_NAME = 'bridge-worker';
const DLQ_CHECK_INTERVAL = 15;
const DLQ_THRESHOLD = 10;

const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];
const state = createTaskState();

async function checkDLQ(): Promise<void> {
  try {
    const counts = await getDLQCounts();
    if (counts.total > DLQ_THRESHOLD) {
      logger.error('[Bridge] DLQ threshold exceeded', undefined, {
        total: counts.total,
        interactive: counts.interactive,
        ingestion: counts.ingestion,
        backfill: counts.backfill,
      });
    } else if (counts.total > 0) {
      logger.warn('[Bridge] DLQ non-empty', counts);
    }
  } catch (err) {
    logger.warn('[Bridge] DLQ check failed', { error: String(err) });
  } finally {
    state.lastRunAt = new Date();
    const circuit = getBridgeCircuitState();
    state.consecutiveErrors = circuit.consecutiveErrors;
    state.circuitOpenedAt = circuit.circuitOpenedAt;
    state.lastError = circuit.lastError;
  }
}

async function probeHealth(): Promise<void> {
  try {
    const down = await isQosmicBridgeDown();
    if (!down) return; // sudah healthy, tidak perlu probe
    logger.info('[Bridge] Health probe scheduled — QOSMIC down, mencoba ping');
    const ok = await probeBridgeHealth();
    if (ok) {
      logger.info('[Bridge] Health probe berhasil — auto-resume ingestion');
    } else {
      logger.info('[Bridge] Health probe masih down — tetap pause');
    }
  } catch (err) {
    logger.warn('[Bridge] Health probe error', { error: String(err) });
  }
}

async function startWorker(): Promise<void> {
  logger.info('[Bridge] Worker starting');

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  await waitForRedisReady();

  startWorkerHeartbeat(WORKER_NAME, state);

  await startBridgeWorkers();

  scheduledTasks.push(
    scheduleEveryMinutes(
      DLQ_CHECK_INTERVAL,
      () => runWithCorrelationContext(WORKER_NAME, () => void checkDLQ()),
      'bridge-dlq-check',
      0,
      { maxIntervalMinutes: 30, idleThreshold: 10 },
    ),
    scheduleEveryMinutes(
      1,
      () => runWithCorrelationContext(WORKER_NAME, () => void probeHealth()),
      'bridge-health-probe',
      0,
      { maxIntervalMinutes: 5, idleThreshold: 1 },
    ),
  );

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state, async () => {
    await stopBridgeWorkers();
  });

  logger.info('[Bridge] Worker started');
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Bridge] Unhandled rejection, exiting', reason, {
    worker: WORKER_NAME,
    promise: String(promise),
  });
  process.exit(1);
});

startWorker().catch((error) => {
  logger.error(`[${WORKER_NAME}] Fatal startup error:`, { error: String(error) });
  process.exit(1);
});
