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

const MAX_CONSECUTIVE_ERRORS = 5;
const AUTO_ASSIGN_SA_BATCH = 10;

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
  },
  autoAssign: {
    running: false,
    lastRunAt: null as Date | null,
    lastError: null as string | null,
    consecutiveErrors: 0,
  },
};

function isDeadlockError(err: unknown): boolean {
  const meta = (err as { meta?: { code?: string | number } } | undefined)?.meta;
  return meta?.code === 3058 || meta?.code === '3058';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type LockResult = 'acquired' | 'skipped' | 'error';

async function withTaskLock(
  lockName: string,
  timeoutSeconds: number,
  fn: () => Promise<void>,
): Promise<LockResult> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let currentLocked = false;
    try {
      const result: unknown = await prisma.$queryRaw`
        SELECT GET_LOCK(${lockName}, ${timeoutSeconds}) as locked
      `;
      const rows = result as Array<{ locked: number | boolean }>;
      currentLocked = rows?.[0]?.locked === 1 || rows?.[0]?.locked === true;

      if (!currentLocked) {
        console.log(`[CRON] ${lockName}: skipped (lock held by another process)`);
        return 'skipped';
      }

      await fn();
      return 'acquired';
    } catch (err) {
      if (isDeadlockError(err) && attempt < maxRetries) {
        console.log(`[CRON] ${lockName}: deadlock detected (attempt ${attempt + 1}), retrying in ${5000 * (attempt + 1)}ms...`);
        await sleep(5000 * (attempt + 1));
        continue;
      }
      console.error(`[CRON] ${lockName}: error`, err);
      throw err;
    } finally {
      if (currentLocked) {
        await prisma.$queryRaw`SELECT RELEASE_LOCK(${lockName})`.catch((e) =>
          console.error(`[CRON] ${lockName}: failed to release lock`, e),
        );
      }
    }
  }
  return 'error';
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

  if (state.running) {
    console.log('[SYNC] Skipped — previous run still in progress');
    return;
  }

  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(
      `[SYNC] Circuit open — ${state.consecutiveErrors} consecutive errors. ` +
        `Skipping until manual reset or worker restart.`,
    );
    return;
  }

  state.running = true;
  const { signal, cancel } = withCancellableTimeout(3 * 60 * 1000);
  state.abortController = new AbortController();

  console.log(`[SYNC] Starting`);

  try {
    const lockResult = await withTaskLock('sync_lock', 5, async () => {
      if (signal.aborted) return;
      await publishSyncEvent('start');

      const result = await syncSpreadsheet(signal);

      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Sync timed out after 3 minutes' });
        return;
      }

      const time = nowWIB();
      console.log(
        `[SYNC] ✅ Done | inserted: ${result.inserted} | updated: ${result.updated} | ${time} WIB`,
      );
      await publishSyncEvent('complete', {
        inserted: result.inserted,
        updated: result.updated,
      });

      state.consecutiveErrors = 0;
      state.lastError = null;
    });

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[SYNC] ❌ Failed:', msg);
    await publishSyncEvent('error', { error: msg }).catch(() => {});
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel();
    state.running = false;
    state.lastRunAt = new Date();
    state.abortController = null;
  }
}

async function runPush(): Promise<void> {
  const state = taskState.push;

  if (state.running) {
    console.log('[PUSH] Skipped — previous run still in progress');
    return;
  }

  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[PUSH] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const { signal, cancel } = withCancellableTimeout(5 * 60 * 1000);

  console.log(`[PUSH] Starting`);

  try {
    const lockResult = await withTaskLock('push_lock', 5, async () => {
      if (signal.aborted) return;
      await publishSyncEvent('start');

      const result = await pushSpreadsheet(signal);

      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Push timed out after 5 minutes' });
        return;
      }

      const time = nowWIB();
      console.log(
        `[PUSH] ✅ Done | updated: ${result.updated ?? 0} | skipped: ${result.skipped ?? 0} | ${time} WIB`,
      );
      await publishSyncEvent('complete', { updated: result.updated, skipped: result.skipped });

      state.consecutiveErrors = 0;
      state.lastError = null;
    });

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[PUSH] ❌ Failed:', msg);
    await publishSyncEvent('error', { error: msg }).catch(() => {});
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel();
    state.running = false;
    state.lastRunAt = new Date();
    state.abortController = null;
  }
}

async function runTechEvents(): Promise<void> {
  const state = taskState.techEvents;

  if (state.running) {
    console.log('[TECH_EVENTS] Skipped — previous run still in progress');
    return;
  }

  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[TECH_EVENTS] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const { signal, cancel } = withCancellableTimeout(2 * 60 * 1000);

  try {
    const lockResult = await withTaskLock('tech_events_lock', 3, async () => {
      if (signal.aborted) return;
      const result = await dispatchTechEvents();

      if (!signal.aborted && 'skipped' in result && result.skipped) {
        return;
      }

      if (!signal.aborted) {
        const time = nowWIB();
        console.log(
          `[TECH_EVENTS] ✅ Done | sent: ${result.success ?? 0} | failed: ${result.failed ?? 0} | ${time} WIB`,
        );
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    });

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[TECH_EVENTS] ❌ Failed:', msg);
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel();
    state.running = false;
    state.lastRunAt = new Date();
  }
}

async function runAutoAssign(): Promise<void> {
  const state = taskState.autoAssign;

  if (state.running) {
    console.log('[AUTO_ASSIGN] Skipped — previous run still in progress');
    return;
  }

  if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[AUTO_ASSIGN] Circuit open — ${state.consecutiveErrors} consecutive errors.`);
    return;
  }

  state.running = true;
  const { signal, cancel } = withCancellableTimeout(60 * 1000);

  try {
    const lockResult = await withTaskLock('auto_assign_lock', 3, async () => {
      if (signal.aborted) return;

      const allSAs = await prisma.service_area.findMany({
        select: { id_sa: true },
      });

      if (allSAs.length === 0) {
        console.log('[AUTO_ASSIGN] No service areas found');
        return;
      }

      const saIds = allSAs.map((s) => s.id_sa);
      const totalSAs = saIds.length;
      const batchSize = Math.min(AUTO_ASSIGN_SA_BATCH, totalSAs);

      const currentIdx = Math.floor(Date.now() / (5 * 60 * 1000)) % totalSAs;
      const batchSAIds: number[] = [];
      for (let i = 0; i < batchSize; i++) {
        batchSAIds.push(saIds[(currentIdx + i) % totalSAs]);
      }

      if (signal.aborted) return;

      const result = await ClusterAutoAssignServiceV2.runBatchV2(batchSAIds, 0);

      if (!signal.aborted) {
        const time = nowWIB();
        const skipped = result.total - result.assigned - result.failed;
        console.log(
          `[AUTO_ASSIGN] ✅ Done | assigned: ${result.assigned}/${result.total} | skipped: ${skipped} | SA ${currentIdx + 1}–${currentIdx + batchSize}/${totalSAs} | ${time} WIB`,
        );
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    });

    if (lockResult === 'skipped') {
      state.running = false;
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[AUTO_ASSIGN] ❌ Failed:', msg);
    state.lastError = msg;
    state.consecutiveErrors++;
  } finally {
    cancel();
    state.running = false;
    state.lastRunAt = new Date();
  }
}

function logWorkerHealth(): void {
  console.log('[WORKER] Health Report:', {
    sheetsQueue: {
      running: sheetsQueue.isRunning,
      queueLength: sheetsQueue.queueLength,
    },
    tasks: {
      sync: {
        running: taskState.sync.running,
        lastRunAt: taskState.sync.lastRunAt ? nowWIB() : 'never',
        consecutiveErrors: taskState.sync.consecutiveErrors,
        lastError: taskState.sync.lastError,
      },
      push: {
        running: taskState.push.running,
        lastRunAt: taskState.push.lastRunAt ? nowWIB() : 'never',
        consecutiveErrors: taskState.push.consecutiveErrors,
        lastError: taskState.push.lastError,
      },
      techEvents: {
        running: taskState.techEvents.running,
        lastRunAt: taskState.techEvents.lastRunAt ? nowWIB() : 'never',
        consecutiveErrors: taskState.techEvents.consecutiveErrors,
        lastError: taskState.techEvents.lastError,
      },
      autoAssign: {
        running: taskState.autoAssign.running,
        lastRunAt: taskState.autoAssign.lastRunAt ? nowWIB() : 'never',
        consecutiveErrors: taskState.autoAssign.consecutiveErrors,
        lastError: taskState.autoAssign.lastError,
      },
    },
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

  const cronEnabled = process.env.CRON_ENABLED === 'true';

  if (!cronEnabled) {
    console.log('[CRON] Disabled (set CRON_ENABLED=true to enable)');
    return;
  }

  scheduledTasks = [
    cron.schedule('*/1 * * * *', () => void runSync()),
    cron.schedule('*/10 * * * *', () => void runPush()),
    cron.schedule('*/2 * * * *', () => void runTechEvents()),
    cron.schedule('*/5 * * * *', () => void runAutoAssign()),
    cron.schedule('*/15 * * * *', () => logWorkerHealth()),
  ];

  console.log(
    '[CRON] Scheduled: sync(1m) push(10m) tech-events(2m) auto-assign(5m, 10 SAs/batch)',
  );
  console.log('[CRON] All tasks run independently via SheetsApiQueue coordination');

  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal} — shutting down...`);

    scheduledTasks.forEach((t) => t.stop());
    console.log('[worker] Cron tasks stopped — no new runs will trigger');

    const waitForTasks = async () => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const anyRunning = Object.values(taskState).some((s) => s.running);
        if (!anyRunning) break;
        const running = Object.entries(taskState)
          .filter(([, s]) => s.running)
          .map(([name]) => name);
        console.log(`[worker] Waiting for tasks to finish: ${running.join(', ')}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    await waitForTasks();

    await Promise.allSettled([
      prisma.$disconnect().then(() => console.log('[worker] Prisma disconnected')),
      redis.quit().then(() => console.log('[worker] Redis disconnected')),
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