/**
 * Redis Client — ioredis singleton
 *
 * Strategi:
 * - Lazy connect: koneksi dibuka saat pertama dipakai, bukan saat import
 * - Fail-fast: jika Redis tidak available, cache miss (degraded gracefully)
 * - Tidak block aplikasi: semua cache operation sudah wrapped isRedisReady()
 *
 * Config Redis Docker (docker-compose.yml):
 *   maxmemory: 64mb, policy: allkeys-lru
 *   Port: 6380 (host) → 6379 (container)
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';

// ── Singleton holder ──────────────────────────────────────────────────────────
let instance: Redis | null = null;

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    // Connection
    lazyConnect: true, // ← Buka koneksi saat pertama dipakai, bukan saat import
    connectTimeout: 5_000, // 5s — jangan tunggu terlalu lama saat startup
    commandTimeout: 3_000, // 3s — timeout per command (bukan retry)

    // Retry — minimal, fail-fast, jangan block aplikasi
    maxRetriesPerRequest: 1, // ← Turun dari 5. Satu retry, lalu throw → cache miss
    retryStrategy: (times: number) => {
      if (times > 3) {
        // Setelah 3 retry reconnect, log dan berhenti mencoba sebentar
        console.error(`[Redis] Reconnect attempt ${times} — backing off`);
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
    console.log('[Redis] Connected');
  });

  client.on('ready', () => {
    console.log('[Redis] Ready');
  });

  client.on('error', (err: Error) => {
    // Jangan spam log untuk connection refused (normal saat Redis restart)
    if ((err as any).code !== 'ECONNREFUSED') {
      console.error('[Redis] Error:', err.message);
    }
  });

  client.on('close', () => {
    console.log('[Redis] Connection closed');
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

export const redis = getInstance();

/**
 * Returns true only if Redis is fully connected and ready.
 * Gunakan ini sebagai guard sebelum semua cache operations.
 */
export function isRedisReady(): boolean {
  return instance?.status === 'ready';
}

/**
 * Graceful shutdown — panggil saat server.ts shutdown.
 */
export async function closeRedis(): Promise<void> {
  if (instance) {
    await instance.quit().catch(() => instance?.disconnect());
    instance = null;
    console.log('[Redis] Disconnected gracefully');
  }
}

export default redis;
