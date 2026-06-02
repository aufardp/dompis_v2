import { logger } from '@/lib/observability/logger';
import { isRedisReady, redis } from '@/lib/redis';

const MAX_EVENTS_PER_WORKER = 500;
const AUDIT_KEY_PREFIX = 'audit:events:';

export interface AuditEvent {
  ts: number;
  worker: string;
  action: string;
  detail: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  if (!isRedisReady()) return;
  const key = `${AUDIT_KEY_PREFIX}${event.worker}`;
  await redis
    .multi()
    .lpush(key, JSON.stringify(event))
    .ltrim(key, 0, MAX_EVENTS_PER_WORKER - 1)
    .expire(key, 86400 * 3)
    .exec()
    .catch((error) => { logger.warn('[AuditTrail] Write failed:', { error: String(error) }); });
}

export async function getAuditEvents(workerName: string, limit = 50): Promise<AuditEvent[]> {
  if (!isRedisReady()) return [];
  const key = `${AUDIT_KEY_PREFIX}${workerName}`;
  const raw = await redis.lrange(key, 0, limit - 1).catch(() => [] as string[]);
  return raw
    .map((item) => {
      try { return JSON.parse(item) as AuditEvent; } catch { return null; }
    })
    .filter((e): e is AuditEvent => e !== null);
}

export async function getAllAuditEvents(limit = 20): Promise<AuditEvent[]> {
  if (!isRedisReady()) return [];
  const keys = await redis.keys(`${AUDIT_KEY_PREFIX}*`).catch(() => [] as string[]);
  const all: AuditEvent[] = [];
  for (const key of keys) {
    const raw = await redis.lrange(key, 0, limit - 1).catch(() => [] as string[]);
    for (const item of raw) {
      try {
        const ev = JSON.parse(item) as AuditEvent;
        all.push(ev);
      } catch { /* skip */ }
    }
  }
  return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
}
