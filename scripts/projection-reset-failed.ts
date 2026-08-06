#!/usr/bin/env tsx
/**
 * Projection failed reset — untuk row yang datanya sudah diperbaiki.
 *
 * Menghapus catatan gagal dari `ticket_projection_log` (status=failed) dan
 * entry Redis `dlq:integration:projection` terkait, sehingga row terkait
 * akan otomatis diambil ulang pada run proyeksi berikutnya.
 *
 * Options:
 *   --incident <INC>   reset hanya incident tertentu (bisa diulang)
 *   --all              reset SEMUA catatan gagal projection
 *   --dry-run          hitung & tampilkan tanpa menghapus apa pun
 *
 * Run with: npm run projection:reset-failed [-- --incident INC51123643]
 */

import 'dotenv/config';
import { prismaBulk } from '@/app/libs/prisma';
import { redis, ensureRedisReady } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

const DLQ_KEY = 'dlq:integration:projection';

interface CliOptions {
  incidents: string[];
  all: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { incidents: [], all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--incident') options.incidents.push(argv[++i]);
  }
  if (options.all && options.incidents.length > 0) {
    throw new Error('--all and --incident cannot be combined');
  }
  if (!options.all && options.incidents.length === 0) {
    throw new Error('Require --all or at least one --incident');
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const where =
    options.all ? { status: 'failed' } : { status: 'failed', incident: { in: options.incidents } };

  const failedRows = await prismaBulk.ticket_projection_log.findMany({
    where,
    select: { id: true, ticketRawId: true, incident: true, attempts: true, updatedAt: true },
  });

  logger.info('[ProjReset] Found failed projection records', {
    count: failedRows.length,
    filter: options.all ? 'all' : options.incidents,
    samples: failedRows.slice(0, 10).map((r) => ({
      ticketRawId: r.ticketRawId,
      incident: r.incident,
      attempts: r.attempts,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });

  if (failedRows.length === 0) {
    logger.info('[ProjReset] Nothing to reset');
    return;
  }

  if (options.dryRun) {
    logger.info('[ProjReset] DRY-RUN finished — nothing deleted');
    return;
  }

  const deleteResult = await prismaBulk.ticket_projection_log.deleteMany({
    where: { id: { in: failedRows.map((r) => r.id) } },
  });
  logger.info('[ProjReset] Deleted failed projection log rows', {
    deleted: deleteResult.count,
  });

  if (await ensureRedisReady()) {
    const raw = await redis.zrange(DLQ_KEY, 0, -1);
    const items = raw
      .map((s) => {
        try {
          return { raw: s, entry: JSON.parse(s) as Record<string, unknown> };
        } catch {
          return null;
        }
      })
      .filter((x): x is { raw: string; entry: Record<string, unknown> } => x !== null);

    const removed = new Set<string>();
    for (const { raw: s, entry } of items) {
      const itemId = (entry.payload as string | undefined);
      let payload: Record<string, unknown> | null = null;
      try {
        payload = itemId ? JSON.parse(itemId) : null;
      } catch {
        payload = null;
      }
      const entryItemId = payload?.itemId as string | undefined;
      const incident = payload?.incident as string | undefined;
      const match = options.all
        ? true
        : options.incidents.includes(incident ?? '') ||
          (entryItemId !== undefined &&
            failedRows.some((r) => r.ticketRawId === entryItemId));
      if (match) removed.add(s);
    }
    if (removed.size > 0) {
      await redis.zrem(DLQ_KEY, ...removed);
      logger.info('[ProjReset] Removed matching DLQ entries', {
        removed: removed.size,
        remaining: await redis.zcard(DLQ_KEY),
      });
    } else {
      logger.info('[ProjReset] No matching DLQ entries to remove');
    }
  }

  logger.info('[ProjReset] Done — rows akan diambil ulang pada run proyeksi berikutnya');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('[ProjReset] Failed', { error: String(err) });
    process.exit(1);
  });
