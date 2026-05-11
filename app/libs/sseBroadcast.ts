import { redis } from '@/lib/redis';

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
      console.log('[SSE-Redis] Waiting for main Redis to connect...');
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

    subClient = redis.duplicate();

    subClient.on('error', (err: Error) => {
      if ((err as any).code !== 'ECONNREFUSED') {
        console.error('[SSE-Redis] Subscriber error:', err.message);
      }
    });

    await subClient.connect();

    await subClient.subscribe('sse:sync', (message) => {
      const enc = new TextEncoder();
      for (const ctrl of activeConnections) {
        try {
          ctrl.enqueue(enc.encode(`data: ${message}\n\n`));
        } catch {
          activeConnections.delete(ctrl);
        }
      }
    });

    await subClient.subscribe('sse:tickets', (message) => {
      const enc = new TextEncoder();
      for (const ctrl of activeConnections) {
        try {
          ctrl.enqueue(enc.encode(`data: ${message}\n\n`));
        } catch {
          activeConnections.delete(ctrl);
        }
      }
    });

    console.log('[SSE-Redis] Subscriber connected');
  } catch (err) {
    console.error('[SSE-Redis] Failed to init subscriber:', err);
  }
}

export function broadcastSyncEvent(type: SyncEventType, data?: SyncEventData) {
  const message = JSON.stringify({ type: 'sync', syncType: type, ...data, ts: Date.now() });
  for (const ctrl of activeConnections) {
    try {
      ctrl.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
    } catch {
      activeConnections.delete(ctrl);
    }
  }
}

export function broadcastTicketInvalidate(reason?: string) {
  const message = JSON.stringify({ type: 'invalidate', reason: reason ?? 'mutation', ts: Date.now() });
  for (const ctrl of activeConnections) {
    try {
      ctrl.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
    } catch {
      activeConnections.delete(ctrl);
    }
  }
}

export function registerSSEConnection(controller: ReadableStreamDefaultController) {
  activeConnections.add(controller);
}

export function unregisterSSEConnection(controller: ReadableStreamDefaultController) {
  activeConnections.delete(controller);
}

export async function closeSSERedis() {
  if (subClient) {
    await subClient.quit().catch(() => {});
    subClient = null;
    console.log('[SSE-Redis] Subscriber disconnected');
  }
}