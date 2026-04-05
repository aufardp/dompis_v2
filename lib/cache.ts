import redis, { isRedisReady } from '@/lib/redis';

export interface CacheOptions {
  ttl?: number;
}

const DEFAULT_TTL = 30;

export async function getCache<T>(key: string): Promise<T | null> {
  if (!isRedisReady()) {
    return null;
  }

  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`[Cache] Error getting key ${key}:`, error);
    return null;
  }
}

export async function setCache<T>(
  key: string,
  data: T,
  ttl: number = DEFAULT_TTL,
): Promise<boolean> {
  if (!isRedisReady()) {
    return false;
  }

  try {
    await redis.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
    return false;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  if (!isRedisReady()) {
    return false;
  }

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error(`[Cache] Error deleting key ${key}:`, error);
    return false;
  }
}

/**
 * Delete cache keys matching a pattern using SCAN (non-blocking).
 * SCAN iterates incrementally — tidak memblok Redis seperti KEYS.
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  if (!isRedisReady()) return 0;

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
    console.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    return 0;
  }
}

/**
 * Invalidate semua cache yang berhubungan dengan tiket.
 * Fire-and-forget — tidak memblok operasi utama.
 */
export async function invalidateTicketsCache(): Promise<void> {
  if (!isRedisReady()) return;

  // Fire-and-forget dengan void (tidak perlu await)
  void (async () => {
    try {
      // Jalankan SCAN secara sequential (bukan parallel) untuk mengurangi beban Redis
      await deleteCachePattern('tickets:*');
      await deleteCachePattern('stats:*');
      await deleteCachePattern('dashboard:*');
    } catch {
      // Silently ignore — cache miss lebih baik dari crash
    }
  })();
}

export async function invalidateTicketById(ticketId: number): Promise<void> {
  if (!isRedisReady()) return;

  try {
    await deleteCache(`ticket:${ticketId}`);
  } catch {
    // Silently ignore
  }
}

export async function invalidateTechniciansCache(): Promise<void> {
  if (!isRedisReady()) return;

  // Fire-and-forget
  (async () => {
    try {
      await deleteCachePattern('technicians:*');
      await deleteCachePattern('attendance:*');
    } catch {
      // Silently ignore
    }
  })();
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

  // Store in background (don't await — don't block response)
  void setCache(key, data, ttl);

  return data;
}
