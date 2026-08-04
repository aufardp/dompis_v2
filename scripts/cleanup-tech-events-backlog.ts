#!/usr/bin/env tsx
/**
 * One-time cleanup script for tech_event_outbox backlog.
 * Archives PENDING events older than 7 days to FAILED.
 * Run with: npx tsx scripts/cleanup-tech-events-backlog.ts
 */

import { prismaBulk } from '@/app/libs/prisma';
import { decrOutboxPending } from '@/lib/observability/gauge-counters';
import { logger } from '@/lib/observability/logger';

const CHUNK_SIZE = 500;
const LOCK_WAIT_TIMEOUT = 120;

async function setLockWaitTimeout() {
  await prismaBulk.$executeRawUnsafe(`SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_TIMEOUT}`);
}

async function chunkedUpdate(
  whereClause: string,
  setClause: string,
  chunkSize = CHUNK_SIZE
): Promise<number> {
  let total = 0;
  while (true) {
    const result = await prismaBulk.$executeRawUnsafe(`
      UPDATE tech_event_outbox
      SET ${setClause}
      WHERE id IN (
        SELECT id FROM tech_event_outbox
        WHERE ${whereClause}
        ORDER BY id LIMIT ${chunkSize}
      )
    `);
    if (result === 0) break;
    total += result;
    await new Promise(r => setTimeout(r, 100)); // yield to other queries
  }
  return total;
}

async function chunkedDelete(
  whereClause: string,
  chunkSize = CHUNK_SIZE
): Promise<number> {
  let total = 0;
  while (true) {
    const result = await prismaBulk.$executeRawUnsafe(`
      DELETE FROM tech_event_outbox
      WHERE id IN (
        SELECT id FROM tech_event_outbox
        WHERE ${whereClause}
        ORDER BY id LIMIT ${chunkSize}
      )
    `);
    if (result === 0) break;
    total += total + result;
    await new Promise(r => setTimeout(r, 100));
  }
  return total;
}

async function cleanupStuckPending() {
  await setLockWaitTimeout();

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().slice(0, 19).replace('T', ' ');
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuckCutoffISO = stuckCutoff.toISOString().slice(0, 19).replace('T', ' ');
  const oldCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldCutoffISO = oldCutoff.toISOString().slice(0, 19).replace('T', ' ');

  logger.info('[Cleanup] Starting tech_event_outbox backlog cleanup', {
    cutoff: cutoffISO,
  });

  // 1. Archive PENDING > 7 days to FAILED (chunked)
  const archived = await chunkedUpdate(
    `status = 'PENDING' AND created_at <= '${cutoffISO}'`,
    `status = 'FAILED', last_error = 'Archived: stuck PENDING > 7 days', next_attempt_at = NULL`
  );

  if (archived > 0) {
    await decrOutboxPending(archived);
    logger.info('[Cleanup] Archived stuck PENDING events', { count: archived });
  }

  // 2. Reset stuck SENDING > 5 minutes to PENDING (chunked)
  const resetSending = await chunkedUpdate(
    `status = 'SENDING' AND updated_at <= '${stuckCutoffISO}'`,
    `status = 'PENDING', last_error = 'Reset from stuck SENDING state (cleanup)', next_attempt_at = NULL`
  );

  if (resetSending > 0) {
    logger.info('[Cleanup] Reset stuck SENDING events to PENDING', { count: resetSending });
  }

  // 3. Cleanup old SENT/FAILED > 7 days (chunked)
  const deleted = await chunkedDelete(
    `created_at <= '${oldCutoffISO}' AND status IN ('SENT', 'FAILED')`
  );

  if (deleted > 0) {
    logger.info('[Cleanup] Deleted old SENT/FAILED events', { count: deleted });
  }

  // Show remaining counts
  const [pendingCount, sendingCount, sentCount, failedCount] = await Promise.all([
    prismaBulk.tech_event_outbox.count({ where: { status: 'PENDING' } }),
    prismaBulk.tech_event_outbox.count({ where: { status: 'SENDING' } }),
    prismaBulk.tech_event_outbox.count({ where: { status: 'SENT' } }),
    prismaBulk.tech_event_outbox.count({ where: { status: 'FAILED' } }),
  ]);

  logger.info('[Cleanup] Completed. Current counts:', {
    pending: pendingCount,
    sending: sendingCount,
    sent: sentCount,
    failed: failedCount,
  });
}

cleanupStuckPending()
  .then(() => {
    logger.info('[Cleanup] Done');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('[Cleanup] Failed', { error: String(err) });
    process.exit(1);
  });