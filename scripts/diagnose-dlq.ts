#!/usr/bin/env tsx
/**
 * DLQ diagnostics — READ-ONLY.
 *
 * Menampilkan kondisi antrian gagal di produksi tanpa mengubah data apa pun:
 *   1. Projection DLQ — isi `ticket_projection_log` (status=failed):
 *      top error, distribusi attempts, sample terbaru, plus Redis zset
 *      `dlq:integration:*` (projection / status-refresh / active-refresh).
 *   2. Bridge DLQ — BullMQ `bridge-interactive` / `bridge-ingestion` /
 *      `bridge-backfill`: jumlah failed + daftar job gagal (failedReason).
 *
 * Run with: npm run dlq:diagnose [-- --top-errors 10] [--projection-only|--bridge-only]
 */

import 'dotenv/config';
import { Queue } from 'bullmq';
import { prismaBulk } from '@/app/libs/prisma';
import { redis, ensureRedisReady } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

const DLQ_PREFIX = 'dlq:integration:';

interface CliOptions {
  projection: boolean;
  bridge: boolean;
  topErrors: number;
  bridgeLimit: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    projection: true,
    bridge: true,
    topErrors: 10,
    bridgeLimit: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--projection-only') options.bridge = false;
    else if (arg === '--bridge-only') options.projection = false;
    else if (arg === '--top-errors') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) options.topErrors = n;
    } else if (arg === '--bridge-limit') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n >= 0) options.bridgeLimit = n;
    }
  }
  return options;
}

async function diagnoseProjection(topErrors: number): Promise<void> {
  logger.info('[DLQDiag] === Projection DLQ ===');

  const failedTotal = await prismaBulk.ticket_projection_log.count({
    where: { status: 'failed' },
  });
  logger.info('[DLQDiag] ticket_projection_log failed total', { failedTotal });

  const top = await prismaBulk.$queryRawUnsafe<
    Array<{
      error: string;
      c: bigint;
      sample_incident: string | null;
      last_failed: Date | null;
    }>
  >(
    `SELECT LEFT(error, 160) AS error, COUNT(*) AS c,
            MIN(incident) AS sample_incident, MAX(updatedAt) AS last_failed
     FROM ticket_projection_log
     WHERE status = 'failed'
     GROUP BY LEFT(error, 160)
     ORDER BY c DESC
     LIMIT ${topErrors}`,
  );

  logger.info('[DLQDiag] Top failed errors:', {
    top: top.map((r) => ({
      error: r.error,
      count: Number(r.c),
      sampleIncident: r.sample_incident,
      lastFailed: r.last_failed?.toISOString(),
    })),
  });

  const attemptsDist = await prismaBulk.$queryRawUnsafe<
    Array<{ attempts: number; c: bigint }>
  >(
    `SELECT attempts, COUNT(*) AS c
     FROM ticket_projection_log
     WHERE status = 'failed'
     GROUP BY attempts
     ORDER BY attempts`,
  );
  logger.info('[DLQDiag] Failed attempts distribution:', {
    byAttempts: Object.fromEntries(
      attemptsDist.map((r) => [`attempts=${r.attempts}`, Number(r.c)]),
    ),
  });

  const recent = await prismaBulk.ticket_projection_log.findMany({
    where: { status: 'failed' },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { incident: true, attempts: true, error: true, updatedAt: true },
  });
  logger.info('[DLQDiag] 20 most recent failures:', {
    samples: recent.map((r) => ({
      incident: r.incident,
      attempts: r.attempts,
      error: (r.error ?? '').slice(0, 200),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });

  if (await ensureRedisReady()) {
    const keys = await redis.keys(`${DLQ_PREFIX}*`);
    if (keys.length === 0) {
      logger.info('[DLQDiag] Redis: no dlq:integration:* keys');
    }
    for (const key of keys.sort()) {
      const source = key.replace(DLQ_PREFIX, '');
      const card = await redis.zcard(key);
      const ttl = await redis.ttl(key);
      const samples = await redis.zrange(key, 0, 4);
      const parsed = samples
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter((x): x is Record<string, unknown> => x !== null);
      logger.info(`[DLQDiag] Redis ${key}`, {
        count: card,
        ttlSeconds: ttl,
        samples: parsed.map((e) => ({
          id: e.id,
          error: String(e.error ?? '').slice(0, 200),
          failedAt: e.failedAt,
        })),
      });
    }
  } else {
    logger.warn('[DLQDiag] Redis not ready — skipping dlq:integration:*');
  }
}

const BRIDGE_QUEUES = ['bridge-interactive', 'bridge-ingestion', 'bridge-backfill'] as const;

async function diagnoseBridge(limit: number): Promise<void> {
  logger.info('[DLQDiag] === Bridge DLQ ===');

  if (!(await ensureRedisReady())) {
    logger.warn('[DLQDiag] Redis not ready — skipping bridge DLQ');
    return;
  }

  const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  };

  const queues = BRIDGE_QUEUES.map(
    (name) => new Queue(name, { connection }),
  );

  try {
    for (const queue of queues) {
      const counts = (await queue.getJobCounts('failed')) as unknown as Record<
        string,
        number
      >;
      const failedCount = Number(counts.failed ?? 0);

      let jobs: Array<{
        id?: string;
        name?: string;
        attemptsMade?: number;
        failedReason?: string;
        finishedOn?: number | null;
      }> = [];
      if (failedCount > 0 && limit > 0) {
        const failedJobs = await queue.getJobs(['failed'], 0, limit - 1, true);
        jobs = failedJobs.map((job) => ({
          id: job.id,
          name: job.name,
          attemptsMade: job.attemptsMade,
          failedReason: (job.failedReason ?? '').slice(0, 300),
          finishedOn: job.finishedOn,
        }));
      }

      logger.info(`[DLQDiag] BullMQ ${queue.name}`, {
        failed: failedCount,
        sampled: jobs.length,
        reasons: jobs.map((j) => ({
          id: j.id,
          name: j.name,
          attemptsMade: j.attemptsMade,
          finishedAt: j.finishedOn
            ? new Date(j.finishedOn).toISOString()
            : null,
          failedReason: j.failedReason,
        })),
      });
    }
  } finally {
    await Promise.all(queues.map((q) => q.close().catch(() => {})));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  logger.info('[DLQDiag] Starting DLQ diagnostics', { ...options });

  if (options.projection) {
    await diagnoseProjection(options.topErrors);
  }
  if (options.bridge) {
    await diagnoseBridge(options.bridgeLimit);
  }

  logger.info('[DLQDiag] Done');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('[DLQDiag] Failed', { error: String(err) });
    process.exit(1);
  });
