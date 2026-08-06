import { prisma } from '@/app/libs/prisma';
import { connectRedis, redis } from '@/lib/redis';
import {
  acquireLock,
  cleanupStaleLock,
  extendLock,
  releaseLock,
} from '@/lib/distributed-lock';
import { closeExternalPool } from '@/lib/external-db/connection';
import { correlationStorage, createCorrelationId, logger } from '@/lib/observability/logger';

export interface WorkerTaskState {
  running: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
  consecutiveErrors: number;
  circuitOpenedAt: Date | null;
  abortController: AbortController | null;
}

export type LockResult = 'acquired' | 'skipped';

export function createTaskState(): WorkerTaskState {
  return {
    running: false,
    lastRunAt: null,
    lastError: null,
    consecutiveErrors: 0,
    circuitOpenedAt: null,
    abortController: null,
  };
}

export function nowWIB(): string {
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

export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function withCancellableTimeout(ms: number): {
  controller: AbortController;
  signal: AbortController['signal'];
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    logger.warn(`[Worker] Timeout after ${ms}ms, aborting task`);
    controller.abort();
  }, ms);

  return {
    controller,
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export async function withTaskLock(
  lockKey: string,
  ttlSeconds: number,
  fn: (context: { ownerId: string; fencingToken: number; correlationId: string }) => Promise<void>,
  options: { abortController?: AbortController; correlationId?: string } = {},
): Promise<LockResult> {
  const correlationId = options.correlationId ?? createCorrelationId(lockKey);
  const lockResult = await acquireLock(lockKey, ttlSeconds);

  if (!lockResult.acquired) {
    logger.info('Task skipped because lock is held', { component: 'worker', task: lockKey, correlationId });
    return 'skipped';
  }

  const ownerId = lockResult.ownerId;
  const fencingToken = lockResult.fencingToken ?? 0;
  const refreshMs = Math.max(10_000, Math.floor((ttlSeconds * 1000) / 3));
  let lostLock = false;
  const refreshTimer = setInterval(() => {
    void extendLock(lockKey, ownerId, ttlSeconds)
      .then((extended) => {
        if (!extended) {
          lostLock = true;
          logger.error('Lost distributed lock ownership, aborting task', undefined, {
            component: 'worker',
            task: lockKey,
            ownerId,
            fencingToken,
            correlationId,
          });
          options.abortController?.abort();
        }
      })
      .catch((error) => {
        lostLock = true;
        logger.error('Failed to renew lock, aborting task', error, {
          component: 'worker',
          task: lockKey,
          ownerId,
          fencingToken,
          correlationId,
        });
        options.abortController?.abort();
      });
  }, refreshMs);
  refreshTimer.unref?.();

  try {
    await fn({ ownerId, fencingToken, correlationId });
    if (lostLock) throw new Error(`Lost distributed lock for ${lockKey}`);
    return 'acquired';
  } finally {
    clearInterval(refreshTimer);
    await releaseLock(lockKey, ownerId).catch((error) =>
      logger.error('[Worker] Failed to release lock:', { lockKey, error: String(error) }),
    );
  }
}

export async function waitForRedisReady(
  timeoutMs: number = 10_000,
): Promise<void> {
  if (redis.status === 'ready') return;

  logger.info('Waiting for Redis ready', { component: 'worker', redisStatus: redis.status });
  await connectRedis().catch(() => undefined);
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    redis.once('ready', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export async function cleanupWorkerLock(
  lockKey: string,
  maxAgeMs: number,
): Promise<void> {
  await cleanupStaleLock(lockKey, maxAgeMs).catch((error) =>
    logger.error('[Worker] Failed to cleanup lock:', { lockKey, error: String(error) }),
  );
}

export async function forceCleanupLock(lockKey: string): Promise<void> {
  if (!redis?.status || redis.status !== 'ready') return;
  try {
    await redis.del(`lock:${lockKey}`, `lock:${lockKey}:meta`);
  } catch (error) {
    logger.error('[Worker] Failed to force-cleanup lock:', { lockKey, error: String(error) });
  }
}

export function installShutdownHandlers(
  workerName: string,
  scheduledTasks: ScheduledTaskHandle[],
  stateOrIsRunning: WorkerTaskState | (() => boolean),
  onShutdown?: () => Promise<void>,
): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn('Worker received shutdown signal', { worker: workerName, signal });
    import('@/lib/observability/audit-trail').then(({ recordAuditEvent }) =>
      recordAuditEvent({
        ts: Date.now(),
        worker: workerName,
        action: 'shutdown',
        detail: `Received ${signal}`,
      }),
    );
    scheduledTasks.forEach((task) => task.stop());
    const isRunning =
      typeof stateOrIsRunning === 'function'
        ? stateOrIsRunning
        : () => stateOrIsRunning.running;
    const abortController =
      typeof stateOrIsRunning === 'function'
        ? null
        : stateOrIsRunning.abortController;

    abortController?.abort();
    await onShutdown?.();

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && isRunning()) {
      logger.info('Waiting for active task to finish', { worker: workerName });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

      await Promise.allSettled([
        prisma.$disconnect().then(() => logger.info('Prisma disconnected', { worker: workerName })),
        redis.quit().then(() => logger.info('Redis disconnected', { worker: workerName })),
      closeExternalPool().then(() =>
        logger.info('External DB pool closed', { worker: workerName }),
      ),
      ]);

    logger.info('Shutdown complete', { worker: workerName });
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGUSR2', () => void shutdown('SIGUSR2'));
}

export interface ScheduledTaskHandle {
  stop: () => void;
  setIntervalOverride?: (minutes: number) => void;
  pendingRunsSinceReset?: number;
}

export function scheduleEveryMinutes(
  minutes: number,
  task: () => (void | Promise<void>),
  taskName?: string,
  offsetSeconds?: number,
  adaptiveBackoff?: {
    maxIntervalMinutes: number;
    idleThreshold: number;
  },
): ScheduledTaskHandle {
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let consecutiveIdle = 0;
  let currentIntervalMs = minutes * 60 * 1000;
  let pendingRunsSinceReset = 0;

  const scheduleNext = () => {
    if (stopped) return;
    timer = setTimeout(execute, currentIntervalMs);
  };

  const execute = async () => {
    if (running || stopped) { scheduleNext(); return; }
    running = true;
    const start = Date.now();
    try {
      await Promise.resolve(task());
      const elapsed = Date.now() - start;
      if (adaptiveBackoff && elapsed < adaptiveBackoff.idleThreshold * 1000) {
        consecutiveIdle++;
        const multiplier = Math.min(consecutiveIdle, 4);
        currentIntervalMs = Math.min(
          minutes * 60 * 1000 * (multiplier + 1),
          adaptiveBackoff.maxIntervalMinutes * 60 * 1000,
        );
      } else if (adaptiveBackoff) {
        consecutiveIdle = 0;
        currentIntervalMs = minutes * 60 * 1000;
        pendingRunsSinceReset = 0;
      }
      pendingRunsSinceReset++;
    } catch (error) {
      logger.error('Scheduled task execution failed', error, {
        component: 'worker',
        task: taskName ?? 'unknown',
        intervalMinutes: minutes,
      });
      if (adaptiveBackoff) {
        consecutiveIdle = Math.min(consecutiveIdle + 1, 4);
        currentIntervalMs = Math.min(
          minutes * 60 * 1000 * (consecutiveIdle + 1),
          adaptiveBackoff.maxIntervalMinutes * 60 * 1000,
        );
      }
    } finally {
      running = false;
      scheduleNext();
    }
  };

  const start = () => {
    const delayMs = (offsetSeconds ?? 0) * 1000;
    setTimeout(() => {
      if (stopped) return;
      void execute();
    }, delayMs);
  };

  start();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    setIntervalOverride: (newMinutes: number) => {
      currentIntervalMs = newMinutes * 60 * 1000;
    },
    pendingRunsSinceReset,
  };
}

export function runWithCorrelationContext<T>(
  workerName: string,
  fn: () => T,
): T {
  const correlationId = createCorrelationId(workerName);
  return correlationStorage.run({ correlationId, workerName }, fn);
}

export function shouldRunWithCircuitBreaker(
  state: WorkerTaskState,
  maxConsecutiveErrors: number,
  resetAfterMs: number,
  workerName?: string,
): boolean {
  if (state.consecutiveErrors < maxConsecutiveErrors) return true;
  if (!state.circuitOpenedAt) {
    state.circuitOpenedAt = new Date();
    if (workerName) {
      import('@/lib/observability/notifier').then(({ sendCriticalAlert }) =>
        sendCriticalAlert(
          `🔴 Circuit Breaker Opened: ${workerName}`,
          `${state.consecutiveErrors} consecutive errors. Auto-reset in ${resetAfterMs / 60000}m.`,
          { worker: workerName, consecutiveErrors: state.consecutiveErrors, lastError: state.lastError ?? '' },
        ),
      );
      import('@/lib/observability/audit-trail').then(({ recordAuditEvent }) =>
        recordAuditEvent({
          ts: Date.now(),
          worker: workerName,
          action: 'circuit_breaker.open',
          detail: `Opened after ${state.consecutiveErrors} consecutive errors. Resets in ${resetAfterMs / 60000}m.`,
          durationMs: resetAfterMs,
          meta: { consecutiveErrors: state.consecutiveErrors, lastError: state.lastError ?? '' },
        }),
      );
    }
    return false;
  }
  if (Date.now() - state.circuitOpenedAt.getTime() >= resetAfterMs) {
    logger.warn('Circuit breaker half-open after reset window', {
      component: 'worker',
      consecutiveErrors: state.consecutiveErrors,
      resetAfterMs,
    });
    state.consecutiveErrors = Math.max(0, maxConsecutiveErrors - 1);
    state.circuitOpenedAt = null;
    return true;
  }
  return false;
}

export async function waitStartupDelay(): Promise<void> {
  const delayMs = parseInt(process.env.WORKER_STARTUP_DELAY_MS || '0', 10);
  if (delayMs > 0) {
    logger.info('[Worker] Startup delay:', { delayMs });
    await new Promise(r => setTimeout(r, delayMs));
  }
}

export async function withPrismaReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isConnection = /P1017|P1001|server has closed|connection refused|econnreset/i.test(msg);
    if (!isConnection) throw err;

    logger.warn('[Prisma] Connection error, reconnecting...', { error: msg.slice(0, 100) });
    await prisma.$disconnect().catch((error) => { logger.warn('[Prisma] Reconnect error:', { error: String(error) }); });
    await new Promise(r => setTimeout(r, 1000));
    await prisma.$connect().catch((error) => { logger.warn('[Prisma] Reconnect error:', { error: String(error) }); });
    return await fn();
  }
}

export async function setMySQLSessionTimeout(ms: number): Promise<void> {
  try {
    await prisma.$executeRaw`SET SESSION MAX_EXECUTION_TIME = ${ms}`;
  } catch {
    // Non-fatal: older MySQL versions may not support this
  }
}

export function startWorkerHeartbeat(
  workerName: string,
  state: WorkerTaskState,
  intervalMs: number = 30_000,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    void redis
      .hset(`worker:heartbeat:${workerName}`, {
        workerName,
        pid: String(process.pid),
        running: String(state.running),
        lastRunAt: state.lastRunAt?.toISOString() ?? '',
        lastError: state.lastError ?? '',
        consecutiveErrors: String(state.consecutiveErrors),
        circuitOpen: String(Boolean(state.circuitOpenedAt)),
        rss: String(memory.rss),
        heapUsed: String(memory.heapUsed),
        heapTotal: String(memory.heapTotal),
        updatedAt: String(Date.now()),
      })
      .catch((error) =>
        logger.error('Failed to write worker heartbeat', error, {
          worker: workerName,
        }),
      );
  }, intervalMs);
  timer.unref?.();
  return timer;
}
