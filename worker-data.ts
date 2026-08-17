import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { runIngestion, processRawRows } from '@/lib/ingestion';
import type { ChunkResult } from '@/lib/ingestion';
import { runStatusRefresh } from '@/lib/status-refresh';
import { runActiveRefresh } from '@/lib/active-refresh';
import { isRedisReady, redis } from '@/lib/redis';
import { PROJECTION_REQUEST_CHANNEL } from '@/lib/worker-signals';
import { iterateNossaClosedBackfill } from '@/lib/external-db/qosmic-bridge/nossa';
import { isQosmicBridgeConfigured } from '@/lib/external-db/qosmic-bridge/client';
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
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';

const WORKER_NAME = 'data-worker';
const MAX_CONSECUTIVE_ERRORS = parsePositiveInt(
  process.env.DATA_WORKER_MAX_CONSECUTIVE_ERRORS,
  5,
);
const CIRCUIT_RESET_MINUTES = parsePositiveInt(
  process.env.DATA_WORKER_CIRCUIT_RESET_MINUTES,
  10,
);
const INTERVAL_MINUTES = parsePositiveInt(
  process.env.DATA_WORKER_INTERVAL_MINUTES,
  2,
);
const TIMEOUT_MINUTES = parsePositiveInt(
  process.env.DATA_WORKER_TIMEOUT_MINUTES,
  30,
);
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.DATA_WORKER_LOCK_TTL_SECONDS,
  Math.max(300, TIMEOUT_MINUTES * 60),
);
const RUN_ON_START = process.env.DATA_WORKER_RUN_ON_START !== 'false';
const SCHEDULE_OFFSET = 0;

const state = createTaskState();
const scheduledTasks: ReturnType<typeof scheduleEveryMinutes>[] = [];

async function runWeeklyBackfill(): Promise<void> {
  if (process.env.DATA_WORKER_BACKFILL_ENABLED !== 'true') return;
  if (!isQosmicBridgeConfigured()) return;

  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setDate(from.getDate() - 14);
  const dateFrom = from.toISOString().slice(0, 10);

  const batchId = `weekly-backfill-${Date.now()}`;
  const cursor = { idColumn: null, modifiedColumn: null, createdAtColumn: null, strategy: 'snapshot' as const, columns: [] };
  const result: ChunkResult = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] };

  logger.info('[WeeklyBackfill] Starting', { dateFrom, dateTo, batchId });

  try {
    for await (const { window: dateWindow, rows } of iterateNossaClosedBackfill(dateFrom, dateTo)) {
      if (rows.length === 0) continue;
      await processRawRows(
        rows as unknown as Record<string, unknown>[],
        'nossa_closed',
        batchId,
        cursor,
        result,
      );
    }
  } catch (error) {
    logger.error('[WeeklyBackfill] Gagal', {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  logger.info('[WeeklyBackfill] Selesai', {
    processed: result.processed,
    inserted: result.inserted,
    updated: result.updated,
  });
}

const PROJECTION_DEBOUNCE_KEY = 'projection:debounce';
const PROJECTION_DEBOUNCE_SECONDS = 30;

async function requestImmediateProjection(syncBatchId?: string | null): Promise<void> {
  if (process.env.DATA_WORKER_TRIGGER_PROJECTION === 'false') return;

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

  // Debounce: hanya publish sekali setiap 30 detik untuk mengurangi flood
  // ke projection worker.
  try {
    const setResult = await redis.set(
      PROJECTION_DEBOUNCE_KEY,
      Date.now().toString(),
      'EX',
      PROJECTION_DEBOUNCE_SECONDS,
      'NX',
    );
    if (setResult !== 'OK') {
      return; // masih dalam window debounce, skip
    }
  } catch {
    // Redis error — tetap lanjut publish (fail-open)
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

async function warmupDashboardSummary(): Promise<void> {
  if (process.env.DASHBOARD_WARMUP_ENABLED === 'false') return;

  try {
    const startTime = Date.now();
    await Promise.allSettled([
      DailyTicketService.getKpiBucketSummaryMatrix(
        'superadmin',
        0,
        { dept: 'all', includeClosed: true },
        undefined,
        undefined,
      ),
      DailyTicketService.getTicketManagementOverviewSummary(
        'superadmin',
        0,
        undefined,
        undefined,
      ),
    ]);
    logger.info('Dashboard summary warmup complete', {
      durationMs: Date.now() - startTime,
      time: nowWIB(),
    });
  } catch (error) {
    logger.warn('Dashboard summary warmup skipped', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runAllTasks(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;

  const ingestionEnabled = process.env.INGESTION_ENABLED === 'true';
  const statusRefreshEnabled = process.env.STATUS_REFRESH_ENABLED === 'true';
  const activeRefreshEnabled = process.env.ACTIVE_REFRESH_ENABLED === 'true';

  if (!ingestionEnabled && !statusRefreshEnabled && !activeRefreshEnabled) {
    logger.info('All data tasks disabled');
    return;
  }

  const ingestionState = createTaskState();
  const statusRefreshState = createTaskState();
  const activeRefreshState = createTaskState();

  // 1. Ingestion
  if (ingestionEnabled && !signal.aborted) {
    const ingestionMaxErrors = parsePositiveInt(process.env.INGESTION_MAX_CONSECUTIVE_ERRORS, 5);
    const ingestionCircuitReset = parsePositiveInt(process.env.INGESTION_CIRCUIT_RESET_MINUTES, 10);
    const ingestionTimeout = parsePositiveInt(process.env.INGESTION_TIMEOUT_MINUTES, 30);

    if (!shouldRunWithCircuitBreaker(ingestionState, ingestionMaxErrors, ingestionCircuitReset * 60_000, 'ingestion')) {
      logger.warn('Ingestion circuit open, skipping');
    } else {
      const { controller, cancel } = withCancellableTimeout(ingestionTimeout * 60_000);
      try {
        const startTime = Date.now();
        const result = await runIngestion(signal);
        const duration = Date.now() - startTime;

        logger.info('Ingestion task complete', {
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
        await recordRun('ingestion', duration, true, {
          processed: result.processed,
          quarantined: result.quarantined,
        });

        ingestionState.consecutiveErrors = 0;
        ingestionState.circuitOpenedAt = null;
        ingestionState.lastError = null;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Ingestion task failed', { error: message });
        await recordRun('ingestion', 0, false, { error: message });
        ingestionState.lastError = message;
        ingestionState.consecutiveErrors++;
        if (ingestionState.consecutiveErrors >= ingestionMaxErrors) {
          ingestionState.circuitOpenedAt = new Date();
        }
      } finally {
        cancel();
      }
    }
  }

  // 2. Status Refresh
  if (statusRefreshEnabled && !signal.aborted) {
    const srMaxErrors = parsePositiveInt(process.env.STATUS_REFRESH_MAX_CONSECUTIVE_ERRORS, 5);
    const srCircuitReset = parsePositiveInt(process.env.STATUS_REFRESH_CIRCUIT_RESET_MINUTES, 10);
    const srTimeout = parsePositiveInt(process.env.STATUS_REFRESH_TIMEOUT_MINUTES, 5);

    if (!shouldRunWithCircuitBreaker(statusRefreshState, srMaxErrors, srCircuitReset * 60_000, 'status_refresh')) {
      logger.warn('Status refresh circuit open, skipping');
    } else {
      const { controller, cancel } = withCancellableTimeout(srTimeout * 60_000);
      try {
        const startTime = Date.now();
        const result = await runStatusRefresh(signal);
        const duration = Date.now() - startTime;

        logger.info('Status refresh task complete', {
          batchId: result.batchId,
          scanned: result.scanned,
          fetched: result.fetched,
          changed: result.changed,
          durationMs: duration,
          time: nowWIB(),
        });
        await recordRun('status_refresh', duration, true, {
          processed: result.scanned,
        });

        statusRefreshState.consecutiveErrors = 0;
        statusRefreshState.circuitOpenedAt = null;
        statusRefreshState.lastError = null;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Status refresh task failed', { error: message });
        await recordRun('status_refresh', 0, false, { error: message });
        statusRefreshState.lastError = message;
        statusRefreshState.consecutiveErrors++;
        if (statusRefreshState.consecutiveErrors >= srMaxErrors) {
          statusRefreshState.circuitOpenedAt = new Date();
        }
      } finally {
        cancel();
      }
    }
  }

  // 3. Active Refresh
  if (activeRefreshEnabled && !signal.aborted) {
    const arMaxErrors = parsePositiveInt(process.env.ACTIVE_REFRESH_MAX_CONSECUTIVE_ERRORS, 5);
    const arCircuitReset = parsePositiveInt(process.env.ACTIVE_REFRESH_CIRCUIT_RESET_MINUTES, 10);
    const arTimeout = parsePositiveInt(process.env.ACTIVE_REFRESH_TIMEOUT_MINUTES, 5);

    if (!shouldRunWithCircuitBreaker(activeRefreshState, arMaxErrors, arCircuitReset * 60_000, 'active_refresh')) {
      logger.warn('Active refresh circuit open, skipping');
    } else {
      const { controller, cancel } = withCancellableTimeout(arTimeout * 60_000);
      try {
        const startTime = Date.now();
        const result = await runActiveRefresh(signal);
        const duration = Date.now() - startTime;

        logger.info('Active refresh task complete', {
          batchId: result.batchId,
          scanned: result.scanned,
          updated: result.updated,
          durationMs: duration,
          time: nowWIB(),
        });
        await recordRun('active_refresh', duration, true, {
          processed: result.scanned,
        });

        activeRefreshState.consecutiveErrors = 0;
        activeRefreshState.circuitOpenedAt = null;
        activeRefreshState.lastError = null;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Active refresh task failed', { error: message });
        await recordRun('active_refresh', 0, false, { error: message });
        activeRefreshState.lastError = message;
        activeRefreshState.consecutiveErrors++;
        if (activeRefreshState.consecutiveErrors >= arMaxErrors) {
          activeRefreshState.circuitOpenedAt = new Date();
        }
      } finally {
        cancel();
      }
    }
  }
}

async function runDataWorkerTask(): Promise<void> {
  if (process.env.DATA_WORKER_ENABLED !== 'true') {
    logger.info('Data worker disabled');
    return;
  }

  if (state.running) {
    logger.info('Data worker skipped, previous run still in progress');
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
    logger.warn('Data worker circuit open', {
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
      'data_worker',
      LOCK_TTL_SECONDS,
      async ({ fencingToken }) => {
        if (signal.aborted) return;

        await runAllTasks(signal);
        const duration = Date.now() - startTime;

        if (signal.aborted) {
          logger.info('Data worker aborted', { durationMs: duration });
          return;
        }

        logger.info('Data worker cycle complete', {
          fencingToken,
          durationMs: duration,
          time: nowWIB(),
        });
        await requestImmediateProjection();
        await warmupDashboardSummary();
        await recordRun(WORKER_NAME, duration, true, {});
        await recordRun('data_worker_cycle', duration, true, {});

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
    logger.error('Data worker task failed', { error: message, durationMs: Date.now() - startTime });
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
  logger.info('Data worker starting', {
    interval: `${INTERVAL_MINUTES}m`,
    timeout: `${TIMEOUT_MINUTES}m`,
    lockTtl: `${LOCK_TTL_SECONDS}s`,
    offset: `${SCHEDULE_OFFSET}s`,
    tasks: {
      ingestion: process.env.INGESTION_ENABLED === 'true',
      statusRefresh: process.env.STATUS_REFRESH_ENABLED === 'true',
      activeRefresh: process.env.ACTIVE_REFRESH_ENABLED === 'true',
    },
  });

  await waitStartupDelay();
  logConfigWarnings(WORKER_NAME);

  await connectDB();
  await waitForRedisReady();
  await forceCleanupLock('data_worker');
  await cleanupWorkerLock('data_worker', TIMEOUT_MINUTES * 60_000);
  await testExternalConnection();
  startWorkerHeartbeat(WORKER_NAME, state);

  scheduledTasks.push(
    scheduleEveryMinutes(INTERVAL_MINUTES, () => runWithCorrelationContext(WORKER_NAME, () => void runDataWorkerTask()), 'data-worker', SCHEDULE_OFFSET, { maxIntervalMinutes: 10, idleThreshold: 5 }),
  );

  // Backfill: run once after startup delay, not on recurring schedule.
  // This avoids long-running contention with the data worker's shared bridge
  // rate-limit budget (20 req/min total: 14 for ingestion+refresh, 6 for backfill).
  const BACKFILL_STARTUP_DELAY_MS = 5 * 60 * 1000;
  const backfillTimer = setTimeout(() => {
    runWithCorrelationContext('weekly-backfill', () => void runWeeklyBackfill());
  }, BACKFILL_STARTUP_DELAY_MS);

  installShutdownHandlers(WORKER_NAME, scheduledTasks, state, () => {
    clearTimeout(backfillTimer);
    return Promise.resolve();
  });

  if (RUN_ON_START) {
    runWithCorrelationContext(WORKER_NAME, () => void runDataWorkerTask());
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
