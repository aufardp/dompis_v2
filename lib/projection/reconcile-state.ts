import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { lockTicketSyncState, markProjectionPending, PROJECTION_CONTRACT_VERSION } from '@/lib/ingestion/sync-state';

export async function reconcileProjectionState(batchSize = 500, reset = false): Promise<{ scanned: number; repaired: number }> {
  const name = 'ticket_sync_reconcile';
  const checkpoint = await prisma.ticket_projection_checkpoint.upsert({
    where: { name }, create: { name }, update: {},
  });
  const cursor = reset ? '' : checkpoint.lastProjectedTicketRawId ?? '';
  const rows = await prisma.ticket_raw.findMany({
    where: { isActive: true, incident: { not: null }, id_ticket: { gt: cursor } },
    orderBy: { id_ticket: 'asc' }, take: batchSize,
    select: { incident: true, id_ticket: true },
  });
  if (!rows.length) {
    await prisma.ticket_projection_checkpoint.update({ where: { name }, data: { lastProjectedTicketRawId: null } });
    return { scanned: 0, repaired: 0 };
  }
  const repaired = await prisma.$transaction(async tx => {
    const incidents = rows.map(row => row.incident!);
    await lockTicketSyncState(tx, incidents);
    const gaps = await tx.$queryRaw<Array<{ incident: string }>>`
      SELECT tr.incident FROM ticket_raw tr
      JOIN ticket_sync_state s ON s.incident = tr.incident
      LEFT JOIN ticket_projection_log l ON l.ticketRawId = tr.id_ticket
      LEFT JOIN ticket t ON t.incident = tr.incident
      WHERE tr.incident IN (${Prisma.join(incidents)}) AND s.pending = FALSE
        AND (s.rawRevision = 0 OR s.appliedRevision < s.rawRevision
          OR s.projectionVersion <> ${PROJECTION_CONTRACT_VERSION}
          OR t.id_ticket IS NULL OR l.status IS NULL OR l.status <> 'success'
          OR NOT (l.sourceHash <=> tr.sourceHash) OR NOT (l.syncVersion <=> tr.syncVersion))
    `;
    await markProjectionPending(tx, gaps.map(row => row.incident));
    await tx.ticket_projection_checkpoint.update({
      where: { name }, data: { lastProjectedTicketRawId: rows.at(-1)!.id_ticket },
    });
    return gaps.length;
  }, { isolationLevel: 'ReadCommitted', timeout: 30000 });
  return { scanned: rows.length, repaired };
}
