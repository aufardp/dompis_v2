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

export interface WorkerTaskState {
  running: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
  consecutiveErrors: number;
}

export type LockResult = 'acquired' | 'skipped';

export function createTaskState(): WorkerTaskState {
  return {
    running: false,
    lastRunAt: null,
    lastError: null,
    consecutiveErrors: 0,
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
  signal: AbortController['signal'];
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log(`[Worker] Timeout after ${ms}ms, aborting task`);
    controller.abort();
  }, ms);

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export async function withTaskLock(
  lockKey: string,
  ttlSeconds: number,
  fn: () => Promise<void>,
): Promise<LockResult> {
  const lockResult = await acquireLock(lockKey, ttlSeconds);

  if (!lockResult.acquired) {
    console.log(`[Worker] ${lockKey}: skipped, lock held by another process`);
    return 'skipped';
  }

  const ownerId = lockResult.ownerId;
  const refreshMs = Math.max(10_000, Math.floor((ttlSeconds * 1000) / 3));
  const refreshTimer = setInterval(() => {
    void extendLock(lockKey, ownerId, ttlSeconds).catch((error) =>
      console.error(`[Worker] ${lockKey}: failed to extend lock`, error),
    );
  }, refreshMs);

  try {
    await fn();
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

  console.log(`[Worker] Waiting for Redis ready (current=${redis.status})...`);
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
  isRunning: () => boolean,
): void {
  const shutdown = async (signal: string) => {
    console.log(`[${workerName}] Received ${signal}, shutting down...`);
    scheduledTasks.forEach((task) => task.stop());

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && isRunning()) {
      console.log(`[${workerName}] Waiting for active task to finish...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await Promise.allSettled([
      prisma.$disconnect().then(() => console.log(`[${workerName}] Prisma disconnected`)),
      redis.quit().then(() => console.log(`[${workerName}] Redis disconnected`)),
      closeExternalPool().then(() =>
        console.log(`[${workerName}] External DB pool closed`),
      ),
    ]);

    console.log(`[${workerName}] Shutdown complete`);
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

