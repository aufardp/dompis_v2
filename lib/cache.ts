import { logger } from '@/lib/observability/logger';
import redis, { ensureRedisReady } from '@/lib/redis';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { gzipSync, gunzipSync } from 'node:zlib';

export interface CacheOptions {
  ttl?: number;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const TICKETS_CACHE_TTL = parsePositiveIntEnv('TICKETS_CACHE_TTL', 15);
export const DASHBOARD_CACHE_TTL = parsePositiveIntEnv('DASHBOARD_CACHE_TTL', 300);
export const STATS_CACHE_TTL = parsePositiveIntEnv('STATS_CACHE_TTL', 300);

const DEFAULT_TTL = 60;
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024;
const MAX_CACHE_BYTES = Number.isFinite(
  Number.parseInt(process.env.CACHE_MAX_BYTES || '', 10),
)
  ? Number.parseInt(process.env.CACHE_MAX_BYTES || '', 10)
  : DEFAULT_MAX_CACHE_BYTES;

function stringifyCacheValue<T>(data: T): string {
  return JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value,
  );
}

function encodeCompressedPayload(payload: string): string {
  const compressed = gzipSync(Buffer.from(payload, 'utf8'));
  return `gz:${compressed.toString('base64')}`;
}

function decodeCompressedPayload(payload: string): string {
  const encoded = payload.slice(3);
  const compressed = Buffer.from(encoded, 'base64');
  return gunzipSync(compressed).toString('utf8');
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!(await ensureRedisReady())) {
    return null;
  }

  try {
    const data = await redis.get(key);
    if (!data) {
      redis.incr('dompis:cache:misses').catch(() => {});
      return null;
    }
    redis.incr('dompis:cache:hits').catch(() => {});
    const raw = data.startsWith('gz:') ? decodeCompressedPayload(data) : data;
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error('[Cache] Error getting key:', { key, error: String(error) });
    redis.incr('dompis:cache:misses').catch(() => {});
    return null;
  }
}

export async function setCache<T>(
  key: string,
  data: T,
  ttl: number = DEFAULT_TTL,
): Promise<boolean> {
  if (!(await ensureRedisReady())) {
    return false;
  }

  try {
    const payload = stringifyCacheValue(data);
    const byteLength = Buffer.byteLength(payload, 'utf8');
    const encodedPayload =
      byteLength > MAX_CACHE_BYTES ? encodeCompressedPayload(payload) : payload;
    const encodedBytes = Buffer.byteLength(encodedPayload, 'utf8');

    if (encodedBytes > MAX_CACHE_BYTES) {
      if (process.env.CACHE_DEBUG_SKIPS === 'true') {
        logger.warn('[Cache] Skip large payload:', {
          key,
          bytes: encodedBytes,
          rawBytes: byteLength,
          max: MAX_CACHE_BYTES,
        });
      }
      return false;
    }

    await redis.setex(key, ttl, encodedPayload);
    return true;
  } catch (error) {
    logger.error('[Cache] Error setting key:', error, { key });
    return false;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  if (!(await ensureRedisReady())) {
    return false;
  }

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('[Cache] Error deleting key:', { key, error: String(error) });
    return false;
  }
}

/**
 * Delete cache keys matching a pattern using SCAN (non-blocking).
 * SCAN iterates incrementally — tidak memblok Redis seperti KEYS.
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  if (!(await ensureRedisReady())) return 0;

  try {
    let cursor = '0';
    let deletedCount = 0;

    // SCAN cursor MATCH pattern COUNT 100
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        // Pipeline: kirim semua DEL dalam satu round-trip
        const pipeline = redis.pipeline();
        keys.forEach((key: string) => pipeline.del(key));
        const results = await pipeline.exec();
        deletedCount +=
          results?.filter(([err]: [Error | null, unknown]) => !err).length ?? 0;
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (error) {
    logger.error('[Cache] Error deleting pattern:', { pattern, error: String(error) });
    return 0;
  }
}

/**
 * Invalidate semua cache yang berhubungan dengan tiket.
 * Awaitable agar refresh UI setelah mutasi tidak membaca cache lama.
 */
export async function invalidateTicketsCache(): Promise<void> {
  if (!(await ensureRedisReady())) return;

  try {
    // Jalankan semua pola SCAN secara paralel — masing-masing pakai pipeline sendiri.
    await Promise.all([
      deleteCachePattern('tickets:*'),
      deleteCachePattern('daily_tickets:*'),
      deleteCachePattern('stats:*'),
      deleteCachePattern('dashboard:*'),
      deleteCachePattern('dashboard_operations_summary:*'),
    ]);
  } catch (error) {
    logger.warn('[Cache] Operation failed:', { error: String(error) });
  }
}

export async function invalidateTicketById(ticketId: number): Promise<void> {
  if (!(await ensureRedisReady())) return;

  try {
    await deleteCache(`ticket:${ticketId}`);
  } catch (error) {
    logger.warn('[Cache] Operation failed:', { error: String(error) });
  }
}

export async function invalidateTechniciansCache(): Promise<void> {
  if (!(await ensureRedisReady())) return;

  try {
    await deleteCachePattern('technicians:*');
    await deleteCachePattern('attendance:*');
  } catch (error) {
    logger.warn('[Cache] Operation failed:', { error: String(error) });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Local mutex: pastikan hanya 1 fn() berjalan per key dalam satu proses
const pendingRebuilds = new Map<string, Promise<unknown>>();

async function dedupeRebuild<T>(key: string, fn: () => Promise<T>, ttl: number, staleTtl: number): Promise<T> {
  const existing = pendingRebuilds.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await fn();
      await setCache(key, data, ttl);
      await setCache(`stale:${key}`, data, staleTtl);
      return data;
    } finally {
      pendingRebuilds.delete(key);
    }
  })();

  pendingRebuilds.set(key, promise);
  return promise;
}

/**
 * Cache-aside helper: ambil dari cache, jika miss jalankan fn() lalu simpan.
 *
 * @example
 * const data = await getOrSetCache('stats:dashboard', () => fetchStats(), 120);
 *
 * Protection:
 * - Distributed lock (10s) mencegah stampede saat cache expire
 * - Stale fallback (300s) serve data basi jika DB down
 * - 3x retry (100ms interval) nunggu rebuild dari requestor lain
 */
export async function getOrSetCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
  staleTtl: number = 300,
): Promise<T> {
  // 1. Try fresh cache first
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;

  const staleKey = `stale:${key}`;
  const lockKey = `cache:rebuild:${key}`;

  // 2. Try distributed lock — only 1 request rebuilds
  const lockResult = await acquireLock(lockKey, 45);
  if (lockResult.acquired) {
    try {
      // Double-check cache after acquiring lock
      const recheck = await getCache<T>(key);
      if (recheck !== null) return recheck;

      return await dedupeRebuild(key, fn, ttl, staleTtl);
    } finally {
      await releaseLock(lockKey, lockResult.ownerId).catch(() => {});
    }
  }

  // 3. Lock not acquired — wait and retry cache (300ms max)
  for (let i = 0; i < 3; i++) {
    await sleep(100);
    const retry = await getCache<T>(key);
    if (retry !== null) return retry;
  }

  // 4. Last resort: serve stale data
  const stale = await getCache<T>(staleKey);
  if (stale !== null) return stale;

  // 5. No stale data — rebuild via local mutex (hanya 1 yg jalan)
  return await dedupeRebuild(key, fn, ttl, staleTtl);
}

/**
 * Same as getOrSetCache but without stampede protection — for non-critical cache.
 */
export async function getOrSetCacheSimple<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;
  const data = await fn();
  await setCache(key, data, ttl);
  return data;
}
