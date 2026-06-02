/**
 * Redis Client — ioredis singleton
 *
 * Strategi:
 * - Lazy connect: koneksi dibuka saat pertama dipakai, bukan saat import
 * - Fail-fast: jika Redis tidak available, cache miss (degraded gracefully)
 * - Tidak block aplikasi: semua cache operation sudah wrapped isRedisReady()
 *
 * Config Redis:
 *   Port: 6379 (production VPS)
 */

import Redis from 'ioredis';
import { logger } from '@/lib/observability/logger';

const REDIS_URL = (() => {
  const port = process.env.REDIS_PORT;
  const host = process.env.REDIS_HOST ?? 'localhost';
  if (port) return `redis://${host}:${port}`;
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
})();

// ── Singleton holder ──────────────────────────────────────────────────────────
let instance: Redis | null = null;

function shouldSkipRedisConnect(): boolean {
  return (
    process.env.SKIP_REDIS_CONNECT === 'true' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  );
}

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    // Connection
    lazyConnect: true,
    connectTimeout: 5_000,
    commandTimeout: 3_000,

    // Retry — minimal, fail-fast, jangan block aplikasi
    maxRetriesPerRequest: 1, // ← Turun dari 5. Satu retry, lalu throw → cache miss
    retryStrategy: (times: number) => {
      if (times > 3) {
        // Setelah 3 retry reconnect, log dan berhenti mencoba sebentar
        logger.error(`[Redis] Reconnect attempt ${times} — backing off`);
        return null; // ioredis: null = stop retrying (akan reconnect otomatis nanti)
      }
      // Backoff: 200ms, 400ms, 800ms
      return Math.min(times * 200, 800);
    },

    // Queue — jangan tumpuk commands saat Redis offline
    enableOfflineQueue: false, // ← Langsung reject saat offline, bukan di-queue

    // Keepalive — penting untuk koneksi Docker container-to-container
    keepAlive: 10_000, // TCP keepalive setiap 10 detik

    // Reliability
    enableReadyCheck: true,
    autoResendUnfulfilledCommands: false, // jangan resend saat reconnect
  });

  // ── Event listeners ─────────────────────────────────────────────────────────
  client.on('connect', () => {
    logger.info('[Redis] Connected');
  });

  client.on('ready', () => {
    logger.info('[Redis] Ready');
  });

  client.on('error', (err: Error) => {
    // Jangan spam log untuk connection refused (normal saat Redis restart)
    if ((err as any).code !== 'ECONNREFUSED') {
      logger.error('[Redis] Error:', { error: err.message });
    }
  });

  client.on('close', () => {
    logger.info('[Redis] Connection closed');
  });

  return client;
}

// ── Exports ───────────────────────────────────────────────────────────────────
function getInstance(): Redis {
  if (!instance) {
    instance = createRedisClient();
  }
  return instance;
}

function shouldBindRedisMember(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const client = getInstance();
    const value = Reflect.get(client, prop, receiver);
    return shouldBindRedisMember(value) ? value.bind(client) : value;
  },
  set(_target, prop, value, receiver) {
    const client = getInstance();
    return Reflect.set(client, prop, value, receiver);
  },
}) as Redis;

/**
 * Returns true only if Redis is fully connected and ready.
 * Gunakan ini sebagai guard sebelum semua cache operations.
 */
export function isRedisReady(): boolean {
  return instance?.status === 'ready';
}

export function getRedisStatus(): string {
  return instance?.status ?? 'null';
}

export async function connectRedis(): Promise<void> {
  if (shouldSkipRedisConnect()) return;
  const client = getInstance();
  if (client.status === 'ready' || client.status === 'connecting') return;
  await client.connect();
}

let lastConnectionAttempt = 0;
const REDIS_RETRY_COOLDOWN_MS = 10_000;

export async function ensureRedisReady(): Promise<boolean> {
  if (isRedisReady()) {
    lastConnectionAttempt = 0;
    return true;
  }
  if (shouldSkipRedisConnect()) return false;

  const now = Date.now();
  if (lastConnectionAttempt > 0 && now - lastConnectionAttempt < REDIS_RETRY_COOLDOWN_MS) {
    return false;
  }

  lastConnectionAttempt = now;
  try {
    await connectRedis();
    return isRedisReady();
  } catch {
    return false;
  }
}

/**
 * Graceful shutdown — panggil saat server.ts shutdown.
 */
export async function closeRedis(): Promise<void> {
  if (instance) {
    await instance.quit().catch(() => instance?.disconnect());
    instance = null;
    logger.info('[Redis] Disconnected gracefully');
  }
}

export default redis;
