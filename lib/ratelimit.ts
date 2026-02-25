import redis, { isRedisReady } from '@/lib/redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowSeconds: number = 60,
): Promise<RateLimitResult> {
  if (!isRedisReady()) {
    return { allowed: true, remaining: limit, resetAt: 0 };
  }

  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    await redis.zremrangebyscore(key, 0, windowStart);

    const count = await redis.zcard(key);
    const remaining = Math.max(0, limit - count - 1);

    if (count >= limit) {
      const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetAt =
        oldestEntry.length > 1
          ? Math.ceil(Number(oldestEntry[1]) / 1000) + windowSeconds
          : Math.ceil(now / 1000) + windowSeconds;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, windowSeconds);

    return {
      allowed: true,
      remaining,
      resetAt: Math.ceil(now / 1000) + windowSeconds,
    };
  } catch (error) {
    console.error('[RateLimit] Error:', error);
    return { allowed: true, remaining: limit, resetAt: 0 };
  }
}

export async function acquireLock(
  key: string,
  ownerId: string,
  ttlSeconds: number = 30,
): Promise<boolean> {
  if (!isRedisReady()) {
    return true;
  }

  try {
    const result = await redis.set(key, ownerId, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (error) {
    console.error('[Lock] Error acquiring lock:', error);
    return false;
  }
}

export async function releaseLock(
  key: string,
  ownerId: string,
): Promise<boolean> {
  if (!isRedisReady()) {
    return true;
  }

  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, key, ownerId);
    return result === 1;
  } catch (error) {
    console.error('[Lock] Error releasing lock:', error);
    return false;
  }
}

export async function isLocked(key: string): Promise<boolean> {
  if (!isRedisReady()) {
    return false;
  }

  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error('[Lock] Error checking lock:', error);
    return false;
  }
}
