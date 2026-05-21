import cron, { ScheduledTask } from 'node-cron';
import 'dotenv/config';
import { prisma, connectDB } from '@/app/libs/prisma';
import { redis, closeRedis } from '@/lib/redis';
import { publishSyncEvent } from '@/lib/sse-redis';
import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { dispatchTechEvents } from '@/app/libs/integrations/dispatchTechEvents';
import { ClusterAutoAssignServiceV2 } from '@/app/libs/services/clusterAutoAssign.service';
import { sheetsQueue } from '@/lib/worker-queue';
import {
  acquireLock,
  extendLock,
  releaseLock,
  getLockStatus,
  cleanupStaleLock,
} from '@/lib/distributed-lock';
import { runIngestion } from '@/lib/ingestion';
import { runProjection } from '@/lib/projection';
import { setSyncStatus, setProjectionStatus, getSyncHealth, getProjectionHealth } from '@/lib/sync-metrics/metrics';
import { closeExternalPool } from '@/lib/external-db/connection';

const MAX_CONSECUTIVE_ERRORS = 5;
const AUTO_ASSIGN_SA_BATCH = 10;

const TASK_LOCK_CONFIGS = {
  sync:        { ttl: 180, timeout: 3 * 60 * 1000 },
  push:        { ttl: 360, timeout: 5 * 60 * 1000 },
  tech_events: { ttl: 150, timeout: 2 * 60 * 1000 },
  auto_assign: { ttl:  75, timeout: 1 * 60 * 1000 },
  ingestion:   { ttl: 300, timeout: 5 * 60 * 1000 },
  projection:  { ttl: 300, timeout: 5 * 60 * 1000 },
} as const;

const taskState = {
  sync: {
    running: false,
    abortController: null as AbortController | null,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
  },
  push: {
    running: false,
    abortController: null as AbortController | null,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
  },
  techEvents: {
    running: false,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
    lastDispatchAt: null as number | null,
  },
  autoAssign: {
    running: false,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
  },
  ingestion: {
    running: false,
    abortController: null as AbortController | null,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
  },
  projection: {
    running: false,
    abortController: null as AbortController | null,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
  },
};

type LockResult = 'acquired' | 'skipped' | 'error';

async function withTaskLock(
  lockKey: string,
  ttlSeconds: number,
  fn: () => Promise<void>,
): Promise<LockResult> {
  const lockResult = await acquireLock(lockKey, ttlSeconds);

  if (!lockResult.acquired) {
    console.log(`[CRON] ${lockKey}: skipped (lock held by another process)`);
    return 'skipped';
  }

  const ownerId = lockResult.ownerId;
  const refreshMs = Math.max(10_000, Math.floor((ttlSeconds * 1000) / 3));
  const refreshTimer = setInterval(() => {
    void extendLock(lockKey, ownerId, ttlSeconds).catch((e) =>
      console.error(`[CRON] ${lockKey}: failed to extend lock`, e),
    );
  }, refreshMs);

  try {
    await fn();
    return 'acquired';
  } finally {
    clearInterval(refreshTimer);
    await releaseLock(lockKey, ownerId).catch((e) =>
      console.error(`[CRON] ${lockKey}: failed to release lock`, e),
    );
  }
}

function withCancellableTimeout(ms: number): {
  signal: AbortController['signal'];
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log(`[CRON] Timeout after ${ms}ms — aborting task`);
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function nowWIB(): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

async function runSync(): Promise<void> {
  const state = taskState.sync;
  if (state.running) { console.log('[SYNC] Skipped — previous run still in progress'); return; }
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[SYNC] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const cfg = TASK_LOCK_CONFIGS.sync;
  const { signal, cancel } = withCancellableTimeout(cfg.timeout);
  state.abortController = new AbortController();

  console.log('[SYNC] Starting');

  try {
    const lockResult = await withTaskLock('sync', cfg.ttl, async () => {
      if (signal.aborted) return;
      await publishSyncEvent('start');
      const result = await syncSpreadsheet(signal);
      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Sync timed out' });
        return;
      }
      const time = nowWIB();
      console.log(`[SYNC] Done | inserted: ${result.inserted} | updated: ${result.updated} | ${time} WIB`);
      await publishSyncEvent('complete', { inserted: result.inserted, updated: result.updated });
      state.consecutiveErrors = 0;
      state.lastError = null;
    });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[SYNC] Failed:', msg);
    await publishSyncEvent('error', { error: msg }).catch(() => {});
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

async function runPush(): Promise<void> {
  const state = taskState.push;
  if (state.running) { console.log('[PUSH] Skipped — previous run still in progress'); return; }
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[PUSH] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const cfg = TASK_LOCK_CONFIGS.push;
  const { signal, cancel } = withCancellableTimeout(cfg.timeout);

  console.log('[PUSH] Starting');

  try {
    const lockResult = await withTaskLock('push', cfg.ttl, async () => {
      if (signal.aborted) return;
      await publishSyncEvent('start');
      const result = await pushSpreadsheet(signal);
      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Push timed out' });
        return;
      }
      const time = nowWIB();
      console.log(`[PUSH] Done | updated: ${result.updated ?? 0} | skipped: ${result.skipped ?? 0} | ${time} WIB`);
      await publishSyncEvent('complete', { updated: result.updated, skipped: result.skipped });
      state.consecutiveErrors = 0;
      state.lastError = null;
    });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[PUSH] Failed:', msg);
    await publishSyncEvent('error', { error: msg }).catch(() => {});
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

const SKIP_IF_DISPATCHED_WITHIN_MS = 60_000;

async function runTechEvents(): Promise<void> {
  const state = taskState.techEvents;
  if (state.running) { console.log('[TECH_EVENTS] Skipped — previous run still in progress'); return; }
  if (Date.now() - (state.lastDispatchAt ?? 0) < SKIP_IF_DISPATCHED_WITHIN_MS) return;
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[TECH_EVENTS] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const cfg = TASK_LOCK_CONFIGS.tech_events;
  const { signal, cancel } = withCancellableTimeout(cfg.timeout);

  try {
    const lockResult = await withTaskLock('tech_events', cfg.ttl, async () => {
      if (signal.aborted) return;
      const result = await dispatchTechEvents();
      if (!signal.aborted && 'skipped' in result && result.skipped) return;
      if (!signal.aborted) {
        const time = nowWIB();
        console.log(`[TECH_EVENTS] Done | sent: ${result.success ?? 0} | failed: ${result.failed ?? 0} | ${time} WIB`);
        state.consecutiveErrors = 0;
        state.lastError = null;
        state.lastDispatchAt = Date.now();
      }
    });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[TECH_EVENTS] Failed:', msg);
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date();
  }
}

async function runAutoAssign(): Promise<void> {
  const state = taskState.autoAssign;
  if (state.running) { console.log('[AUTO_ASSIGN] Skipped — previous run still in progress'); return; }
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[AUTO_ASSIGN] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const cfg = TASK_LOCK_CONFIGS.auto_assign;
  const { signal, cancel } = withCancellableTimeout(cfg.timeout);

  try {
    const lockResult = await withTaskLock('auto_assign', cfg.ttl, async () => {
      if (signal.aborted) return;
      const allSAs = await prisma.service_area.findMany({ select: { id_sa: true } });
      if (allSAs.length === 0) { console.log('[AUTO_ASSIGN] No service areas found'); return; }

      const saIds = allSAs.map((s) => s.id_sa);
      const totalSAs = saIds.length;
      const batchSize = Math.min(AUTO_ASSIGN_SA_BATCH, totalSAs);
      const currentIdx = Math.floor(Date.now() / (5 * 60 * 1000)) % totalSAs;
      const batchSAIds: number[] = [];
      for (let i = 0; i < batchSize; i++) batchSAIds.push(saIds[(currentIdx + i) % totalSAs]);

      if (signal.aborted) return;
      const result = await ClusterAutoAssignServiceV2.runBatchV2(batchSAIds, 0);

      if (!signal.aborted) {
        const time = nowWIB();
        const skipped = result.total - result.assigned - result.failed;
        console.log(`[AUTO_ASSIGN] Done | assigned: ${result.assigned}/${result.total} | skipped: ${skipped} | SA ${currentIdx + 1}–${currentIdx + batchSize}/${totalSAs} | ${time} WIB`);
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[AUTO_ASSIGN] Failed:', msg);
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date();
  }
}

async function runIngestionTask(): Promise<void> {
  const state = taskState.ingestion;
  if (state.running) { console.log('[INGESTION] Skipped — previous run still in progress'); return; }
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[INGESTION] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const cfg = TASK_LOCK_CONFIGS.ingestion;
  const { signal, cancel } = withCancellableTimeout(cfg.timeout);
  state.abortController = new AbortController();
  const startTime = Date.now();

  try {
    const lockResult = await withTaskLock('ingestion', cfg.ttl, async () => {
      if (signal.aborted) return;
      await setSyncStatus('running', {});
      const result = await runIngestion(signal);
      if (signal.aborted) {
        await setSyncStatus('failed', { duration: Date.now() - startTime });
        return;
      }
      const duration = Date.now() - startTime;
      const time = nowWIB();
      console.log(`[INGESTION] Done | inserted: ${result.inserted} | updated: ${result.updated} | skipped: ${result.skipped} | failed: ${result.failed} | ${time} WIB`);
      await setSyncStatus('success', {
        duration, processed: result.inserted + result.updated + result.skipped + result.failed,
        inserted: result.inserted, updated: result.updated, skipped: result.skipped, failed: result.failed,
      });
      state.consecutiveErrors = 0;
      state.lastError = null;
      state.running = false;
      console.log('[WORKER] Ingestion completed, triggering projection...');
      await runProjectionTask({ syncBatchId: result.syncBatchId });
    });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[INGESTION] Failed:', msg);
    await setSyncStatus('failed', { duration: Date.now() - startTime });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

async function runProjectionTask(
  options: { syncBatchId?: string } = {},
): Promise<void> {
  const state = taskState.projection;
  if (taskState.ingestion.running) { console.log('[PROJECTION] Skipped — ingestion still in progress'); return; }
  if (state.running) { console.log('[PROJECTION] Skipped — previous run still in progress'); return; }
  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[PROJECTION] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const cfg = TASK_LOCK_CONFIGS.projection;
  const { signal, cancel } = withCancellableTimeout(cfg.timeout);
  state.abortController = new AbortController();
  const startTime = Date.now();

  try {
    const lockResult = await withTaskLock('projection', cfg.ttl, async () => {
      if (signal.aborted) return;
      await setProjectionStatus('running', {});
      const result = await runProjection(signal, {
        syncBatchId: options.syncBatchId,
      });
      if (signal.aborted) {
        await setProjectionStatus('failed', { duration: Date.now() - startTime });
        return;
      }
      const duration = Date.now() - startTime;
      const time = nowWIB();
      console.log(`[PROJECTION] Done | inserted: ${result.inserted} | updated: ${result.updated} | skipped: ${result.skipped} | failed: ${result.failed} | ${time} WIB`);
      await setProjectionStatus('success', {
        duration, processed: result.processed, inserted: result.inserted, updated: result.updated,
      });
      state.consecutiveErrors = 0;
      state.lastError = null;
    });
    if (lockResult === 'skipped') state.running = false;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[PROJECTION] Failed:', msg);
    await setProjectionStatus('failed', { duration: Date.now() - startTime });
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel(); state.running = false; state.lastRunAt = new Date(); state.abortController = null;
  }
}

async function logWorkerHealth(): Promise<void> {
  const [syncHealth, projectionHealth] = await Promise.all([
    getSyncHealth(), getProjectionHealth(),
  ]);

  const lockKeys = ['sync', 'push', 'tech_events', 'auto_assign', 'ingestion', 'projection'] as const;
  const lockStatuses = await Promise.all(lockKeys.map((k) => getLockStatus(k)));

  console.log('[WORKER] Health Report:', {
    locks: Object.fromEntries(
      lockKeys.map((k, i) => [k, { held: lockStatuses[i].held, owner: lockStatuses[i].owner }])
    ),
    tasks: {
      sync: { running: taskState.sync.running, lastRunAt: taskState.sync.lastRunAt ? nowWIB() : 'never', errors: taskState.sync.consecutiveErrors },
      push: { running: taskState.push.running, lastRunAt: taskState.push.lastRunAt ? nowWIB() : 'never', errors: taskState.push.consecutiveErrors },
      techEvents: { running: taskState.techEvents.running, lastRunAt: taskState.techEvents.lastRunAt ? nowWIB() : 'never', errors: taskState.techEvents.consecutiveErrors },
      autoAssign: { running: taskState.autoAssign.running, lastRunAt: taskState.autoAssign.lastRunAt ? nowWIB() : 'never', errors: taskState.autoAssign.consecutiveErrors },
      ingestion: { running: taskState.ingestion.running, lastRunAt: taskState.ingestion.lastRunAt ? nowWIB() : 'never', errors: taskState.ingestion.consecutiveErrors },
      projection: { running: taskState.projection.running, lastRunAt: taskState.projection.lastRunAt ? nowWIB() : 'never', errors: taskState.projection.consecutiveErrors },
    },
    pipeline: {
      lastSync: {
        status: syncHealth.lastSyncStatus,
        at: syncHealth.lastSyncTime ? nowWIB() : 'never',
        duration: syncHealth.lastSyncDuration ? `${(syncHealth.lastSyncDuration / 1000).toFixed(1)}s` : null,
        rows: { inserted: syncHealth.insertedCount, updated: syncHealth.updatedCount, skipped: syncHealth.skippedCount, failed: syncHealth.failedCount },
      },
      lastProjection: {
        status: projectionHealth.lastProjectionStatus,
        at: projectionHealth.lastProjectionTime ? nowWIB() : 'never',
        records: { processed: projectionHealth.processedRecords, inserted: projectionHealth.insertedRecords, updated: projectionHealth.updatedRecords },
      },
    },
    sheetsQueue: { running: sheetsQueue.isRunning, queueLength: sheetsQueue.queueLength },
  });
}

let scheduledTasks: ScheduledTask[] = [];

async function startWorker() {
  console.log('[worker] Starting...');

  try {
    await connectDB();
    console.log('[worker] DB connected');
  } catch (err) {
    console.error('[worker] DB connection failed, starting anyway:', err);
  }

  const { redis } = await import('@/lib/redis');
  if (redis.status !== 'ready') {
    console.log('[worker] Waiting for Redis ready...');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  const lockKeys = ['sync', 'push', 'tech_events', 'auto_assign', 'ingestion', 'projection'] as const;
  for (const lockKey of lockKeys) {
    const cfg = TASK_LOCK_CONFIGS[lockKey];
    await cleanupStaleLock(lockKey, cfg.timeout).catch(() => {});
  }

  const cronEnabled = process.env.CRON_ENABLED === 'true';
  if (!cronEnabled) {
    console.log('[CRON] Disabled (set CRON_ENABLED=true to enable)');
    return;
  }

  const ingestionInterval = process.env.INGESTION_INTERVAL_MINUTES || '5';
  const pipelineEnabled = process.env.WORKER_ENABLE_PIPELINE === 'true';

  scheduledTasks = [
    cron.schedule('*/2 * * * *', () => void runTechEvents()),
    cron.schedule('*/5 * * * *', () => void runAutoAssign()),
    cron.schedule('*/15 * * * *', () => void logWorkerHealth()),
  ];
  if (pipelineEnabled) {
    scheduledTasks.push(
      cron.schedule(`*/${ingestionInterval} * * * *`, () =>
        void runIngestionTask(),
      ),
    );
  }

  console.log(
    `[CRON] Scheduled: tech-events(2m) auto-assign(5m) health(15m) pipeline=${pipelineEnabled ? `enabled ingestion(${ingestionInterval}m)` : 'disabled'} - [Google Sheets sync DISABLED]`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal} — shutting down...`);
    scheduledTasks.forEach((t) => t.stop());
    console.log('[worker] Cron tasks stopped — no new runs will trigger');

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const anyRunning = Object.values(taskState).some((s) => s.running);
      if (!anyRunning) break;
      const running = Object.entries(taskState).filter(([, s]) => s.running).map(([name]) => name);
      console.log(`[worker] Waiting for tasks to finish: ${running.join(', ')}`);
      await new Promise((r) => setTimeout(r, 1000));
    }

    await Promise.allSettled([
      prisma.$disconnect().then(() => console.log('[worker] Prisma disconnected')),
      redis.quit().then(() => console.log('[worker] Redis disconnected')),
      closeExternalPool().then(() => console.log('[worker] External DB pool closed')),
    ]);

    console.log('[worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGUSR2', () => void shutdown('SIGUSR2'));

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[worker] Unhandled rejection at:', promise, 'reason:', reason);
  });
}

startWorker().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exit(1);
});
