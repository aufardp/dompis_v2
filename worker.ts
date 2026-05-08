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

async function withTaskLock(
  lockName: string,
  timeoutSeconds: number,
  fn: () => Promise<void>,
): Promise<void> {
  let locked = false;
  try {
    const result: any = await prisma.$queryRaw`
      SELECT GET_LOCK(${lockName}, ${timeoutSeconds}) as locked
    `;
    locked = result?.[0]?.locked === 1;

    if (!locked) {
      console.log(`[CRON] ${lockName}: skipped (lock held by another process)`);
      return;
    }

    await fn();
  } catch (error) {
    console.error(`[CRON] ${lockName}: error`, error);
    throw error;
  } finally {
    if (locked) {
      await prisma.$queryRaw`SELECT RELEASE_LOCK(${lockName})`.catch((e) =>
        console.error(`[CRON] ${lockName}: failed to release lock`, e),
      );
    }
  }
}

function withCancellableTimeout(ms: number): {
  signal: AbortSignal;
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

  console.log(`[SYNC] Starting (sheetsQueue length: ${sheetsQueue.queueLength})`);

  try {
    await withTaskLock('sync_lock', 5, async () => {
      await publishSyncEvent('start');

      const result = await syncSpreadsheet(signal);

      if (signal.aborted) {
        await publishSyncEvent('error', { error: 'Sync timed out after 3 minutes' });
        return;
      }

      console.log(
        `[SYNC] Done — inserted: ${result.inserted}, updated: ${result.updated}`,
      );
      await publishSyncEvent('complete', {
        inserted: result.inserted,
        updated: result.updated,
      });

      state.consecutiveErrors = 0;
      state.lastError = null;
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[SYNC] Failed:', msg);
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

  console.log(`[PUSH] Starting (sheetsQueue length: ${sheetsQueue.queueLength})`);

  try {
    await withTaskLock('push_lock', 5, async () => {
      const result = await pushSpreadsheet(signal);

      if (signal.aborted) {
        console.warn('[PUSH] Timed out after 5 minutes');
        return;
      }

      console.log('[PUSH] Done:', result);
      state.consecutiveErrors = 0;
      state.lastError = null;
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[PUSH] Failed:', msg);
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
    await withTaskLock('tech_events_lock', 3, async () => {
      if (signal.aborted) return;
      const result = await dispatchTechEvents();
      if (!signal.aborted) {
        console.log('[TECH_EVENTS] Done:', result);
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[TECH_EVENTS] Failed:', msg);
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
    await withTaskLock('auto_assign_lock', 3, async () => {
      if (signal.aborted) return;

      const allSAs = await prisma.service_area.findMany({
        select: { id_sa: true },
      });

      if (allSAs.length === 0) {
        console.log('[AUTO_ASSIGN] No service areas found');
        return;
      }

      const saIds = allSAs.map((s) => s.id_sa);
      const currentIdx =
        Math.floor(Date.now() / (5 * 60 * 1000)) % saIds.length;
      const currentSA = [saIds[currentIdx]];

      console.log(
        `[AUTO_ASSIGN] Processing SA ${currentSA[0]} (${currentIdx + 1}/${saIds.length})`,
      );

      if (signal.aborted) return;

      const result = await ClusterAutoAssignServiceV2.runBatchV2(currentSA, 0);

      if (!signal.aborted) {
        console.log(
          `[AUTO_ASSIGN] Done — ${result.assigned}/${result.total} assigned for SA ${currentSA[0]}`,
        );
        state.consecutiveErrors = 0;
        state.lastError = null;
      }
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[AUTO_ASSIGN] Failed:', msg);
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
        lastRunAt: taskState.sync.lastRunAt?.toISOString() ?? 'never',
        consecutiveErrors: taskState.sync.consecutiveErrors,
        lastError: taskState.sync.lastError,
      },
      push: {
        running: taskState.push.running,
        lastRunAt: taskState.push.lastRunAt?.toISOString() ?? 'never',
        consecutiveErrors: taskState.push.consecutiveErrors,
        lastError: taskState.push.lastError,
      },
      techEvents: {
        running: taskState.techEvents.running,
        lastRunAt: taskState.techEvents.lastRunAt?.toISOString() ?? 'never',
        consecutiveErrors: taskState.techEvents.consecutiveErrors,
      },
      autoAssign: {
        running: taskState.autoAssign.running,
        lastRunAt: taskState.autoAssign.lastRunAt?.toISOString() ?? 'never',
        consecutiveErrors: taskState.autoAssign.consecutiveErrors,
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
    cron.schedule('*/5 * * * *', () => logWorkerHealth()),
  ];

  console.log(
    '[CRON] Scheduled: sync(1m) push(10m) tech-events(2m) auto-assign(5m)',
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