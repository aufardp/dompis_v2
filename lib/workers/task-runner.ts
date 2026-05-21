import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '@/app/libs/prisma';
import { redis } from '@/lib/redis';
import {
  acquireLock,
  cleanupStaleLock,
  extendLock,
  releaseLock,
} from '@/lib/distributed-lock';
import { closeExternalPool } from '@/lib/external-db/connection';
import { createCorrelationId, logger } from '@/lib/observability/logger';

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
    console.log(`[Worker] Timeout after ${ms}ms, aborting task`);
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
      console.error(`[Worker] ${lockKey}: failed to release lock`, error),
    );
  }
}

export async function waitForRedisReady(
  timeoutMs: number = 10_000,
): Promise<void> {
  if (redis.status === 'ready') return;

  logger.info('Waiting for Redis ready', { component: 'worker', redisStatus: redis.status });
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
    console.error(`[Worker] Failed to cleanup ${lockKey} lock`, error),
  );
}

export function installShutdownHandlers(
  workerName: string,
  scheduledTasks: ScheduledTask[],
  stateOrIsRunning: WorkerTaskState | (() => boolean),
): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn('Worker received shutdown signal', { worker: workerName, signal });
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

export function scheduleEveryMinutes(
  minutes: number,
  task: () => void,
): ScheduledTask {
  return cron.schedule(`*/${minutes} * * * *`, task);
}

export function shouldRunWithCircuitBreaker(
  state: WorkerTaskState,
  maxConsecutiveErrors: number,
  resetAfterMs: number,
): boolean {
  if (state.consecutiveErrors < maxConsecutiveErrors) return true;
  if (!state.circuitOpenedAt) {
    state.circuitOpenedAt = new Date();
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
