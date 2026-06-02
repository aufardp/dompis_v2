import { logger } from '@/lib/observability/logger';
import { redis, isRedisReady } from '@/lib/redis';

let subClient: ReturnType<typeof redis.duplicate> | null = null;
const activeConnections = new Set<ReadableStreamDefaultController>();

export type SyncEventType = 'start' | 'complete' | 'error';

export interface SyncEventData {
  inserted?: number;
  updated?: number;
  error?: string;
}

export async function initSSERedis() {
  if (subClient) return;

  try {
    if (redis.status === 'connecting') {
      logger.info('[SSE-Redis] Waiting for main Redis to connect...');
      await new Promise<void>((resolve) => {
        const check = () => {
          if (redis.status !== 'connecting') {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    subClient = redis.duplicate({ lazyConnect: true });

    subClient.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNREFUSED') {
        logger.error('[SSE-Redis] Subscriber error:', { error: err.message });
      }
    });

    await subClient.connect();

    subClient.on('message', (_channel: string, message: string) => {
      broadcastToActive(message);
    });

    await subClient.subscribe('sse:sync', 'sse:tickets');

    logger.info('[SSE-Redis] Subscriber connected');
  } catch (err) {
    logger.error('[SSE-Redis] Failed to init subscriber:', { error: String(err) });
  }
}

function broadcastToActive(message: string) {
  const enc = new TextEncoder();
  const stale: typeof activeConnections = new Set();
  for (const ctrl of activeConnections) {
    try {
      ctrl.enqueue(enc.encode(`data: ${message}\n\n`));
    } catch {
      stale.add(ctrl);
    }
  }
  for (const ctrl of stale) activeConnections.delete(ctrl);
}

export function broadcastSyncEvent(type: SyncEventType, data?: SyncEventData) {
  const message = JSON.stringify({ type: 'sync', syncType: type, ...data, ts: Date.now() });
  broadcastToActive(message);
  if (isRedisReady()) {
    void redis.publish('sse:sync', message).catch(() => {});
  }
}

export function broadcastTicketInvalidate(reason?: string) {
  const message = JSON.stringify({ type: 'invalidate', reason: reason ?? 'mutation', ts: Date.now() });
  broadcastToActive(message);
  if (isRedisReady()) {
    void redis.publish('sse:tickets', message).catch(() => {});
  }
}

export function registerSSEConnection(controller: ReadableStreamDefaultController, signal?: AbortSignal) {
  activeConnections.add(controller);
  if (signal) {
    if (signal.aborted) {
      activeConnections.delete(controller);
      return;
    }
    signal.addEventListener('abort', () => {
      activeConnections.delete(controller);
    }, { once: true });
  }
}

export function unregisterSSEConnection(controller: ReadableStreamDefaultController) {
  activeConnections.delete(controller);
}

export async function closeSSERedis() {
  if (subClient) {
    await subClient.unsubscribe().catch(() => {});
    await subClient.quit().catch(() => {});
    subClient = null;
    logger.info('[SSE-Redis] Subscriber disconnected');
  }
}
