import { redis } from '@/lib/redis';

export type SyncEventType = 'start' | 'complete' | 'error';

export interface SyncEventData {
  inserted?: number;
  updated?: number;
  skipped?: number;
  error?: string;
}

export interface TicketEventData {
  reason?: string;
  ticketId?: string;
}

export async function publishSyncEvent(type: SyncEventType, data?: SyncEventData) {
  if (!isRedisReady()) {
    console.warn('[SSE-Redis] Redis not ready, skipping publish');
    return;
  }
  const payload = JSON.stringify({
    type: 'sync',
    syncType: type,
    ...data,
    ts: Date.now(),
  });
  await redis.publish('sse:sync', payload);
}

export async function publishTicketInvalidate(reason?: string) {
  if (!isRedisReady()) {
    console.warn('[SSE-Redis] Redis not ready, skipping publish');
    return;
  }
  const payload = JSON.stringify({
    type: 'invalidate',
    reason: reason ?? 'mutation',
    ts: Date.now(),
  });
  await redis.publish('sse:tickets', payload);
}

function isRedisReady(): boolean {
  return redis?.status === 'ready';
}