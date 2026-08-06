#!/usr/bin/env tsx
/**
 * Tech event outbox cleanup.
 *
 * Runs chunked, low-impact maintenance on tech_event_outbox:
 *   1. Purge of dead ingestion events (TICKET_RAW_* / INGESTION_*).
 *      These are written by the legacy ingestion pipeline, are NOT part of
 *      DISPATCHABLE_TECH_EVENT_TYPES, and have no consumer — so they are
 *      deleted directly.
 *   2. Hygiene for the remaining dispatchable events:
 *      - reset stuck SENDING (> 5 min) back to PENDING
 *      - archive PENDING older than 7 days to FAILED
 *      - delete SENT/FAILED older than 7 days
 *
 * Options:
 *   --dry-run              count and report without writing anything
 *   --only-purge           only purge dead ingestion events
 *   --only-hygiene         only run hygiene steps (skip purge)
 *   --chunk-size N         rows per statement (default 500)
 *   --sleep-ms N           pause between statements (default 100)
 *
 * Run with: npm run outbox:cleanup[:dry]
 */

import { prismaBulk } from '@/app/libs/prisma';
import {
  decrOutboxPending,
  setOutboxPendingCount,
} from '@/lib/observability/gauge-counters';
import { logger } from '@/lib/observability/logger';

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_SLEEP_MS = 100;
const LOCK_WAIT_TIMEOUT = 120;
const PROGRESS_LOG_INTERVAL_MS = 60 * 1000;

// Event types written by the old ingestion pipeline. No consumer exists, so
// they can be purged entirely.
const DEAD_EVENT_TYPES = [
  'TICKET_RAW_CREATED',
  'TICKET_RAW_UPDATED',
  'TICKET_RAW_STATUS_CHANGED',
  'TICKET_RAW_DELETED',
  'INGESTION_COMPLETE',
  'INGESTION_FAILED',
];

interface CliOptions {
  dryRun: boolean;
  onlyPurge: boolean;
  onlyHygiene: boolean;
  chunkSize: number;
  sleepMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    onlyPurge: false,
    onlyHygiene: false,
    chunkSize: DEFAULT_CHUNK_SIZE,
    sleepMs: DEFAULT_SLEEP_MS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--only-purge') options.onlyPurge = true;
    else if (arg === '--only-hygiene') options.onlyHygiene = true;
    else if (arg === '--chunk-size') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) options.chunkSize = n;
    } else if (arg === '--sleep-ms') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n >= 0) options.sleepMs = n;
    }
  }

  if (options.onlyPurge && options.onlyHygiene) {
    throw new Error('--only-purge and --only-hygiene cannot be combined');
  }

  return options;
}

async function setLockWaitTimeout() {
  await prismaBulk.$executeRawUnsafe(
    `SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_TIMEOUT}`,
  );
}

/**
 * Chunked DELETE using a derived-table wrapper. The pattern
 * `WHERE id IN (SELECT id FROM t ... LIMIT n)` is rejected by MySQL 8.0
 * (error 1235); wrapping the subquery in a derived table works.
 */
async function chunkedDelete(
  whereClause: string,
  chunkSize: number,
  sleepMs: number,
  label: string,
): Promise<number> {
  let total = 0;
  const startedAt = Date.now();
  let lastLogAt = startedAt;

  while (true) {
    const result = await prismaBulk.$executeRawUnsafe(`
      DELETE FROM tech_event_outbox
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM tech_event_outbox
          WHERE ${whereClause}
          ORDER BY id LIMIT ${chunkSize}
        ) AS _tmp
      )
    `);
    if (result === 0) break;
    total += result;

    const now = Date.now();
    if (now - lastLogAt >= PROGRESS_LOG_INTERVAL_MS) {
      const elapsedSec = (now - startedAt) / 1000;
      const rate = elapsedSec > 0 ? Math.round(total / elapsedSec) : 0;
      lastLogAt = now;
      logger.info(`[Cleanup] ${label} progress`, {
        processed: total,
        rowsPerSec: rate,
        elapsedSec: Math.round(elapsedSec),
      });
    }

    if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
  }

  return total;
}

/**
 * Chunked UPDATE using the same derived-table wrapper.
 */
async function chunkedUpdate(
  whereClause: string,
  setClause: string,
  chunkSize: number,
  sleepMs: number,
  label: string,
): Promise<number> {
  let total = 0;
  const startedAt = Date.now();
  let lastLogAt = startedAt;

  while (true) {
    const result = await prismaBulk.$executeRawUnsafe(`
      UPDATE tech_event_outbox
      SET ${setClause}
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM tech_event_outbox
          WHERE ${whereClause}
          ORDER BY id LIMIT ${chunkSize}
        ) AS _tmp
      )
    `);
    if (result === 0) break;
    total += result;

    const now = Date.now();
    if (now - lastLogAt >= PROGRESS_LOG_INTERVAL_MS) {
      const elapsedSec = (now - startedAt) / 1000;
      const rate = elapsedSec > 0 ? Math.round(total / elapsedSec) : 0;
      lastLogAt = now;
      logger.info(`[Cleanup] ${label} progress`, {
        processed: total,
        rowsPerSec: rate,
        elapsedSec: Math.round(elapsedSec),
      });
    }

    if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
  }

  return total;
}

async function purgeDeadEvents(chunkSize: number, sleepMs: number) {
  const typeList = DEAD_EVENT_TYPES.map((t) => `'${t}'`).join(',');
  const deleted = await chunkedDelete(
    `event_type IN (${typeList})`,
    chunkSize,
    sleepMs,
    'Purge dead ingestion events',
  );
  if (deleted > 0) {
    logger.info('[Cleanup] Purged dead ingestion events', { count: deleted });
  }
  return deleted;
}

async function reportCounts() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().slice(0, 19).replace('T', ' ');
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuckCutoffISO = stuckCutoff.toISOString().slice(0, 19).replace('T', ' ');
  const typeList = DEAD_EVENT_TYPES.map((t) => `'${t}'`).join(',');

  const [
    statusCounts,
    deadByType,
    pendingOld,
    sendingStuck,
    sentFailedOld,
  ] = await Promise.all([
    prismaBulk.$queryRawUnsafe<Array<{ status: string; c: bigint }>>(
      `SELECT status, COUNT(*) AS c FROM tech_event_outbox GROUP BY status`,
    ),
    prismaBulk.$queryRawUnsafe<Array<{ event_type: string; c: bigint }>>(
      `SELECT event_type, COUNT(*) AS c FROM tech_event_outbox
       WHERE event_type IN (${typeList}) GROUP BY event_type`,
    ),
    prismaBulk.tech_event_outbox.count({
      where: { status: 'PENDING', created_at: { lte: cutoff } },
    }),
    prismaBulk.tech_event_outbox.count({
      where: { status: 'SENDING', updated_at: { lte: stuckCutoff } },
    }),
    prismaBulk.tech_event_outbox.count({
      where: {
        status: { in: ['SENT', 'FAILED'] },
        created_at: { lte: cutoff },
      },
    }),
  ]);

  const total = statusCounts.reduce((sum, r) => sum + Number(r.c), 0);
  const deadTotal = deadByType.reduce((sum, r) => sum + Number(r.c), 0);

  logger.info('[Cleanup] DRY-RUN report — tech_event_outbox', {
    total,
    byStatus: Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.c)])),
    deadIngestionByType: Object.fromEntries(
      deadByType.map((r) => [r.event_type, Number(r.c)]),
    ),
    deadIngestionTotal: deadTotal,
    pendingOlderThan7d: pendingOld,
    sendingStuck5m: sendingStuck,
    sentFailedOlderThan7d: sentFailedOld,
  });

  logger.info(
    `[Cleanup] Akan dipurge: ${deadTotal.toLocaleString()} dead events. ` +
    `Akan diarsip/delete: ${pendingOld} PENDING>7d, ${sentFailedOld} SENT/FAILED>7d. ` +
    `Akan direset: ${sendingStuck} SENDING stuck.`,
  );
}

async function runHygiene(chunkSize: number, sleepMs: number) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().slice(0, 19).replace('T', ' ');
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuckCutoffISO = stuckCutoff.toISOString().slice(0, 19).replace('T', ' ');

  // Archive PENDING > 7 days to FAILED (chunked)
  const archived = await chunkedUpdate(
    `status = 'PENDING' AND created_at <= '${cutoffISO}'`,
    `status = 'FAILED', last_error = 'Archived: stuck PENDING > 7 days', next_attempt_at = NULL`,
    chunkSize,
    sleepMs,
    'Archive stuck PENDING',
  );
  if (archived > 0) {
    await decrOutboxPending(archived);
    logger.info('[Cleanup] Archived stuck PENDING events', { count: archived });
  }

  // Reset stuck SENDING > 5 minutes to PENDING (chunked)
  const resetSending = await chunkedUpdate(
    `status = 'SENDING' AND updated_at <= '${stuckCutoffISO}'`,
    `status = 'PENDING', last_error = 'Reset from stuck SENDING state (cleanup)', next_attempt_at = NULL`,
    chunkSize,
    sleepMs,
    'Reset stuck SENDING',
  );
  if (resetSending > 0) {
    logger.info('[Cleanup] Reset stuck SENDING events to PENDING', {
      count: resetSending,
    });
  }

  // Delete old SENT/FAILED > 7 days (chunked)
  const deleted = await chunkedDelete(
    `created_at <= '${cutoffISO}' AND status IN ('SENT', 'FAILED')`,
    chunkSize,
    sleepMs,
    'Delete old SENT/FAILED',
  );
  if (deleted > 0) {
    logger.info('[Cleanup] Deleted old SENT/FAILED events', { count: deleted });
  }

  // Re-sync gauge from real count (deletes above may have made it stale)
  const pendingCount = await prismaBulk.tech_event_outbox.count({
    where: { status: 'PENDING' },
  });
  await setOutboxPendingCount(pendingCount).catch(() => {});

  // Show remaining counts
  const [sendingCount, sentCount, failedCount] = await Promise.all([
    prismaBulk.tech_event_outbox.count({ where: { status: 'SENDING' } }),
    prismaBulk.tech_event_outbox.count({ where: { status: 'SENT' } }),
    prismaBulk.tech_event_outbox.count({ where: { status: 'FAILED' } }),
  ]);

  logger.info('[Cleanup] Hygiene completed. Current counts:', {
    pending: pendingCount,
    sending: sendingCount,
    sent: sentCount,
    failed: failedCount,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  logger.info('[Cleanup] Starting tech_event_outbox cleanup', {
    dryRun: options.dryRun,
    onlyPurge: options.onlyPurge,
    onlyHygiene: options.onlyHygiene,
    chunkSize: options.chunkSize,
    sleepMs: options.sleepMs,
  });

  if (options.dryRun) {
    await reportCounts();
    logger.info('[Cleanup] DRY-RUN finished — no data was written');
    return;
  }

  await setLockWaitTimeout();

  if (options.onlyHygiene) {
    await runHygiene(options.chunkSize, options.sleepMs);
    return;
  }

  // Full run: purge first, then hygiene (purge frees the big backlog, so the
  // archive/delete steps only touch the few dispatchable rows left).
  await purgeDeadEvents(options.chunkSize, options.sleepMs);

  if (!options.onlyPurge) {
    await runHygiene(options.chunkSize, options.sleepMs);
  }
}

main()
  .then(() => {
    logger.info('[Cleanup] Done');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('[Cleanup] Failed', { error: String(err) });
    process.exit(1);
  });
