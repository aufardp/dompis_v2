import { logger } from '@/lib/observability/logger';
import redis, { ensureRedisReady } from '@/lib/redis';

export interface CacheOptions {
  ttl?: number;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const TICKETS_CACHE_TTL = parsePositiveIntEnv('TICKETS_CACHE_TTL', 15);
export const DASHBOARD_CACHE_TTL = parsePositiveIntEnv('DASHBOARD_CACHE_TTL', 30);
export const STATS_CACHE_TTL = parsePositiveIntEnv('STATS_CACHE_TTL', 30);

const DEFAULT_TTL = 60;
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024;
const MAX_CACHE_BYTES = Number.isFinite(
  Number.parseInt(process.env.CACHE_MAX_BYTES || '', 10),
)
  ? Number.parseInt(process.env.CACHE_MAX_BYTES || '', 10)
  : DEFAULT_MAX_CACHE_BYTES;

export async function getCache<T>(key: string): Promise<T | null> {
  if (!(await ensureRedisReady())) {
    return null;
  }

  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error('[Cache] Error getting key:', { key, error: String(error) });
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
    const payload = JSON.stringify(data);
    const byteLength = Buffer.byteLength(payload, 'utf8');
    if (byteLength > MAX_CACHE_BYTES) {
      if (process.env.CACHE_DEBUG_SKIPS === 'true') {
        logger.warn('[Cache] Skip large payload:', { key, bytes: byteLength, max: MAX_CACHE_BYTES });
      }
      return false;
    }

    await redis.setex(key, ttl, payload);
    return true;
  } catch (error) {
    logger.error('[Cache] Error setting key:', { key, error: String(error) });
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

/**
 * Cache-aside helper: ambil dari cache, jika miss jalankan fn() lalu simpan.
 *
 * @example
 * const data = await getOrSetCache('stats:dashboard', () => fetchStats(), 120);
 */
export async function getOrSetCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  // Try cache first
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;

  // Cache miss — compute
  const data = await fn();

  // Store synchronously — blocking is negligible vs recompute cost
  await setCache(key, data, ttl);

  return data;
}
