#!/usr/bin/env tsx
/**
 * Bridge DLQ — manual retry script.
 *
 * Mendaftar dan/atau mengulang job gagal pada BullMQ bridge queues
 * (`bridge-interactive`, `bridge-ingestion`, `bridge-backfill`).
 *
 * Safe-by-default: tanpa `--retry` hanya menampilkan daftar (dry-run).
 *
 * Options:
 *   --queue <name>        filter ke queue tertentu (bisa diulang; default semua)
 *   --limit N             jumlah job gagal maks per queue yang diproses (default 20)
 *   --retry               re-queue job gagal via job.retry()
 *   --clear               bersihkan job gagal dari failed list (tanpa re-queue)
 *
 * Run with: npm run bridge:dlq-retry [-- --retry --queue bridge-interactive]
 */

import 'dotenv/config';
import { Queue } from 'bullmq';
import { ensureRedisReady } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

const BRIDGE_QUEUES = ['bridge-interactive', 'bridge-ingestion', 'bridge-backfill'] as const;

interface CliOptions {
  queues: string[];
  limit: number;
  retry: boolean;
  clear: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    queues: [],
    limit: 20,
    retry: false,
    clear: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--retry') options.retry = true;
    else if (arg === '--clear') options.clear = true;
    else if (arg === '--queue') options.queues.push(argv[++i]);
    else if (arg === '--limit') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n >= 0) options.limit = n;
    }
  }
  if (options.clear && options.retry) {
    throw new Error('--clear and --retry cannot be combined');
  }
  return options;
}

function buildConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  };
}

async function processQueue(
  queue: Queue,
  options: CliOptions,
): Promise<{ failed: number; retried: number; cleared: number }> {
  const counts = (await queue.getJobCounts('failed')) as unknown as Record<
    string,
    number
  >;
  const failed = Number(counts.failed ?? 0);

  if (failed === 0) {
    logger.info(`[BridgeDLQ] ${queue.name}: no failed jobs`);
    return { failed: 0, retried: 0, cleared: 0 };
  }

  if (options.limit === 0) {
    logger.info(`[BridgeDLQ] ${queue.name}: ${failed} failed jobs (limit 0 — skipped)`);
    return { failed, retried: 0, cleared: 0 };
  }

  const failedJobs = await queue.getJobs(['failed'], 0, options.limit - 1, true);

  if (!options.retry && !options.clear) {
    logger.info(`[BridgeDLQ] ${queue.name}: ${failed} failed job(s) — DRY-RUN`, {
      samples: failedJobs.map((job) => ({
        id: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        finishedAt: job.finishedOn
          ? new Date(job.finishedOn).toISOString()
          : null,
        failedReason: (job.failedReason ?? '').slice(0, 300),
      })),
    });
    return { failed, retried: 0, cleared: 0 };
  }

  let retried = 0;
  let cleared = 0;

  if (options.retry) {
    for (const job of failedJobs) {
      try {
        await job.retry();
        retried++;
        logger.info(`[BridgeDLQ] ${queue.name}: requeued job`, {
          id: job.id,
          name: job.name,
        });
      } catch (err) {
        logger.warn(`[BridgeDLQ] ${queue.name}: retry failed for job`, {
          id: job.id,
          error: String(err),
        });
      }
    }
    logger.info(`[BridgeDLQ] ${queue.name}: requeued ${retried}/${failedJobs.length} failed job(s)`);
  }

  if (options.clear) {
    const removed = await queue.clean(0, failedJobs.length, 'failed');
    cleared = removed.length;
    logger.info(`[BridgeDLQ] ${queue.name}: cleared ${cleared} failed job(s)`);
  }

  return { failed, retried, cleared };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const selected = options.queues.length
    ? BRIDGE_QUEUES.filter((q) => options.queues.includes(q))
    : [...BRIDGE_QUEUES];

  if (selected.length === 0) {
    throw new Error(
      `Unknown --queue value(s): ${options.queues.join(', ')}. Valid: ${BRIDGE_QUEUES.join(', ')}`,
    );
  }

  logger.info('[BridgeDLQ] Starting bridge DLQ retry', {
    queues: selected,
    limit: options.limit,
    action: options.clear ? 'clear' : options.retry ? 'retry' : 'dry-run',
  });

  if (!(await ensureRedisReady())) {
    throw new Error('Redis not ready — cannot access BullMQ queues');
  }

  const queues = selected.map(
    (name) => new Queue(name, { connection: buildConnection() }),
  );

  const totals = { failed: 0, retried: 0, cleared: 0 };
  try {
    for (const queue of queues) {
      const result = await processQueue(queue, options);
      totals.failed += result.failed;
      totals.retried += result.retried;
      totals.cleared += result.cleared;
    }
  } finally {
    await Promise.all(queues.map((q) => q.close().catch(() => {})));
  }

  logger.info('[BridgeDLQ] Done', { totals });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('[BridgeDLQ] Failed', {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : typeof err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
