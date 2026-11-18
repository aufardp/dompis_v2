import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { redis, isRedisReady } from '@/lib/redis';

const VERSION_KEY = 'cache:tickets:version';
const ROTATED_AT_KEY = 'cache:tickets:version:rotatedAt';

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Jeda minimum antar rotasi `cache:tickets:version`. Tanpa jeda ini, rotasi
 * tiap detik membuat TTL cache tiket tidak pernah terpakai.
 */
const REVISION_MIN_INTERVAL_MS = parsePositiveIntEnv(
  'CACHE_REVISION_MIN_INTERVAL_MS',
  30_000,
);

async function rotateTicketCacheVersion(): Promise<void> {
  const nowMs = Date.now();
  const rotatedAt = Number(await redis.get(ROTATED_AT_KEY).catch(() => null));
  if (
    Number.isFinite(rotatedAt) &&
    rotatedAt > 0 &&
    nowMs - rotatedAt < REVISION_MIN_INTERVAL_MS
  ) {
    return;
  }
  await redis.set(VERSION_KEY, randomUUID());
  await redis.set(ROTATED_AT_KEY, String(nowMs));
}

export async function flushProjectionEffects(): Promise<number> {
  if (!isRedisReady()) return 0;
  const pending = await prisma.ticket_sync_state.findMany({
    where: { effectsPending: true }, take: 1000, orderBy: { incident: 'asc' },
    select: { incident: true, effectsRevision: true },
  });
  if (!pending.length) return 0;
  await rotateTicketCacheVersion();
  await redis.set('cache:dashboard:dirtyAt', String(Date.now()));
  await redis.publish('sse:tickets', JSON.stringify({ type: 'invalidate', reason: 'projection', ts: Date.now() }));
  await prisma.$executeRaw`
    UPDATE ticket_sync_state SET effectsApplied = effectsRevision, effectsPending = FALSE
    WHERE (incident, effectsRevision) IN (${Prisma.join(pending.map(row => Prisma.sql`(${row.incident}, ${row.effectsRevision})`))})
  `;
  return pending.length;
}
