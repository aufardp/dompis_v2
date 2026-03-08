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

export async function deleteCachePattern(pattern: string): Promise<number> {
  if (!isRedisReady()) {
    return 0;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (error) {
    console.error(
      `[Cache] Error deleting keys with pattern ${pattern}:`,
      error,
    );
    return 0;
  }
}

export async function invalidateTicketsCache(): Promise<void> {
  // Skip if Redis is not ready (non-blocking)
  if (!isRedisReady()) {
    return;
  }

  // Fire-and-forget: don't block on cache invalidation
  // Errors are silently ignored to prevent disrupting main operation
  (async () => {
    try {
      await Promise.all([
        deleteCachePattern('tickets:*'),
        deleteCachePattern('stats:*'),
        deleteCachePattern('dashboard:*'),
      ]);
    } catch (error) {
      // Silently ignore cache invalidation errors
      // Main operation (ticket mutation) should not fail due to cache issues
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
      await Promise.all([
        deleteCachePattern('technicians:*'),
        deleteCachePattern('attendance:*'),
      ]);
    } catch {
      // Silently ignore
    }
  })();
}
