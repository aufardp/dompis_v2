import { Prisma } from '@prisma/client';

export const PROJECTION_CONTRACT_VERSION = 1;

export function isRevisionSyncEnabled(): boolean {
  return process.env.TICKET_SYNC_REVISIONS_ENABLED === 'true';
}

export async function lockTicketSyncState(tx: Prisma.TransactionClient, incidents: string[]): Promise<Map<string, bigint>> {
  if (!isRevisionSyncEnabled() || incidents.length === 0) return new Map();
  const ordered = [...new Set(incidents)].sort();
  await tx.$executeRaw`
    INSERT INTO ticket_sync_state (incident)
    VALUES ${Prisma.join(ordered.map(incident => Prisma.sql`(${incident})`))}
    ON DUPLICATE KEY UPDATE incident = VALUES(incident)
  `;
  const states = await tx.$queryRaw<Array<{ incident: string; rawRevision: bigint }>>`
    SELECT incident, rawRevision FROM ticket_sync_state
    WHERE incident IN (${Prisma.join(ordered)}) ORDER BY incident FOR UPDATE
  `;
  return new Map(states.map(state => [state.incident, state.rawRevision]));
}

export async function markProjectionPending(tx: Prisma.TransactionClient, incidents: string[]): Promise<void> {
  if (!isRevisionSyncEnabled() || incidents.length === 0) return;
  const now = new Date();
  await tx.$executeRaw`
    INSERT INTO ticket_sync_state
      (incident, rawRevision, pending, pendingSince, nextAttemptAt, observedAt)
    VALUES ${Prisma.join([...new Set(incidents)].sort().map(incident => Prisma.sql`(${incident}, 1, TRUE, ${now}, ${now}, ${now})`))}
    ON DUPLICATE KEY UPDATE
      rawRevision = rawRevision + 1,
      pendingSince = IF(pending, pendingSince, VALUES(pendingSince)),
      pending = TRUE,
      nextAttemptAt = VALUES(nextAttemptAt),
      observedAt = VALUES(observedAt),
      attempts = 0,
      lastError = NULL
  `;
}
