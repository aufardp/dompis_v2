#!/usr/bin/env tsx
/**
 * One-time cleanup script for tech_event_outbox backlog.
 * Archives PENDING events older than 7 days to FAILED.
 * Run with: npx tsx scripts/cleanup-tech-events-backlog.ts
 */

import { prismaBulk } from '@/app/libs/prisma';
import { decrOutboxPending } from '@/lib/observability/gauge-counters';
import { logger } from '@/lib/observability/logger';

async function cleanupStuckPending() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  logger.info('[Cleanup] Starting tech_event_outbox backlog cleanup', {
    cutoff: cutoff.toISOString(),
  });

  // Archive PENDING > 7 days to FAILED
  const archived = await prismaBulk.tech_event_outbox.updateMany({
    where: {
      status: 'PENDING',
      created_at: { lte: cutoff },
    },
    data: {
      status: 'FAILED',
      last_error: 'Archived: stuck PENDING > 7 days',
      next_attempt_at: null,
    },
  });

  if (archived.count > 0) {
    await decrOutboxPending(archived.count);
    logger.info('[Cleanup] Archived stuck PENDING events', {
      count: archived.count,
    });
  }

  // Also reset stuck SENDING > 5 minutes to PENDING
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const resetSending = await prismaBulk.tech_event_outbox.updateMany({
    where: {
      status: 'SENDING',
      updated_at: { lte: stuckCutoff },
    },
    data: {
      status: 'PENDING',
      last_error: 'Reset from stuck SENDING state (cleanup)',
      next_attempt_at: null,
    },
  });

  if (resetSending.count > 0) {
    logger.info('[Cleanup] Reset stuck SENDING events to PENDING', {
      count: resetSending.count,
    });
  }

  // Cleanup old SENT/FAILED (>7 days)
  const oldCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await prismaBulk.tech_event_outbox.deleteMany({
    where: {
      created_at: { lte: oldCutoff },
      status: { in: ['SENT', 'FAILED'] },
    },
  });

  if (deleted.count > 0) {
    logger.info('[Cleanup] Deleted old SENT/FAILED events', {
      count: deleted.count,
    });
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