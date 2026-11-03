import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { redis, isRedisReady } from '@/lib/redis';

export async function flushProjectionEffects(): Promise<number> {
  if (!isRedisReady()) return 0;
  const pending = await prisma.ticket_sync_state.findMany({
    where: { effectsPending: true }, take: 1000, orderBy: { incident: 'asc' },
    select: { incident: true, effectsRevision: true },
  });
  if (!pending.length) return 0;
  await redis.set('cache:tickets:version', randomUUID());
  await redis.set('cache:dashboard:dirtyAt', String(Date.now()));
  await redis.publish('sse:tickets', JSON.stringify({ type: 'invalidate', reason: 'projection', ts: Date.now() }));
  await prisma.$executeRaw`
    UPDATE ticket_sync_state SET effectsApplied = effectsRevision, effectsPending = FALSE
    WHERE (incident, effectsRevision) IN (${Prisma.join(pending.map(row => Prisma.sql`(${row.incident}, ${row.effectsRevision})`))})
  `;
  return pending.length;
}
