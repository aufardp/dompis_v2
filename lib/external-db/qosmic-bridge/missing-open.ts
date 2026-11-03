import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { nowWib } from '@/lib/timezone';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { interactiveQueue } from './bridge-queue';
import { isRevisionSyncEnabled } from '@/lib/ingestion/sync-state';

export async function confirmMissingOpenTickets(scanStartedAt: Date, legacyScanStartedAt = nowWib()): Promise<number> {
  if (!isRevisionSyncEnabled()) return 0;
  const limit = Math.max(1, Math.min(5, Number(process.env.BRIDGE_MISSING_OPEN_LOOKUPS_PER_SCAN) || 1));
  const candidates = await prisma.$queryRaw<Array<{ incident: string }>>`
    SELECT tr.incident FROM ticket_raw tr
    LEFT JOIN status_refresh_ticket_state s ON s.incident = tr.incident
    LEFT JOIN ticket_source_snapshot q ON q.incident = tr.incident AND q.sourceFamily = 'qosmic'
    WHERE COALESCE(q.resource, tr.sourceTable) = 'nossa' AND tr.isActive = TRUE AND tr.incident IS NOT NULL
      AND ((q.incident IS NOT NULL AND q.observedAt < ${new Date(scanStartedAt.getTime() - 60000)})
        OR (q.incident IS NULL AND tr.lastSeenAt < ${new Date(legacyScanStartedAt.getTime() - 60000)}))
      AND tr.status NOT IN (${Prisma.join(CLOSE_STATUS_VALUES)})
      AND (s.lastCheckedAt IS NULL OR s.lastCheckedAt < ${new Date(nowWib().getTime() - 300000)})
    ORDER BY s.lastCheckedAt, tr.lastSeenAt, tr.incident LIMIT ${limit}
  `;
  for (const row of candidates) {
    const id = `missing-open-${row.incident}`;
    const existing = await interactiveQueue.getJob(id);
    if (existing) {
      if (!['completed', 'failed'].includes(await existing.getState())) continue;
      await existing.remove();
    }
    await interactiveQueue.add('confirm-missing-open', {
      incident: row.incident, sourceTable: 'nossa_closed', correlationId: id,
    }, { jobId: id, priority: 3 });
  }
  return candidates.length;
}
