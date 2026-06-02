import { redis } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

export type LockResult = 'acquired' | 'skipped' | 'error';

interface LockHandle {
  key: string;
  ownerId: string;
  fencingToken: number;
  acquiredAt: number;
  expiresAt: number;
}

const activeLocks = new Map<string, LockHandle>();

// Periodic cleanup every 60s to evict expired lock handles
setInterval(() => {
  const now = Date.now();
  for (const [key, handle] of activeLocks) {
    if (handle.expiresAt < now) {
      activeLocks.delete(key);
    }
  }
}, 60_000).unref();

function generateOwnerId(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function isRedisConnected(): boolean {
  return redis.status === 'ready';
}

export async function acquireLock(
  key: string,
  ttlSeconds: number = 300,
): Promise<{ acquired: boolean; ownerId: string; fencingToken: number | null; handle: LockHandle | null }> {
  if (!isRedisConnected()) {
    logger.warn('Redis not ready, lock denied', { component: 'distributed-lock', lockKey: key, redisStatus: redis.status });
    const fallbackOwner = generateOwnerId();
    return { acquired: false, ownerId: fallbackOwner, fencingToken: null, handle: null };
  }

  const owner = generateOwnerId();
  const redisKey = `lock:${key}`;
  const fencingKey = `lock:${key}:fencing`;

  try {
    const script = `
      if redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2], "NX") then
        local token = redis.call("incr", KEYS[2])
        redis.call("hset", KEYS[3], "owner", ARGV[1], "token", token, "acquiredAt", ARGV[3], "ttlMs", ARGV[2])
        redis.call("pexpire", KEYS[3], ARGV[2])
        return token
      else
        return 0
      end
    `;
    const ttlMs = ttlSeconds * 1000;
    const result = await redis.eval(script, 3, redisKey, fencingKey, `${redisKey}:meta`, owner, ttlMs, Date.now());

    if (typeof result === 'number' && result > 0) {
      const handle: LockHandle = {
        key,
        ownerId: owner,
        fencingToken: result,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };
      activeLocks.set(key, handle);
      logger.info('Lock acquired', { component: 'distributed-lock', lockKey: key, ownerId: owner, fencingToken: result, ttlSeconds });
      return { acquired: true, ownerId: owner, fencingToken: result, handle };
    }

    const existing = await redis.get(redisKey);
    if (existing) {
      logger.info('Lock held by another owner', { component: 'distributed-lock', lockKey: key, ownerId: existing });
    }

    return { acquired: false, ownerId: owner, fencingToken: null, handle: null };
  } catch (err) {
    logger.error('Redis error acquiring lock', err, { component: 'distributed-lock', lockKey: key, ownerId: owner });
    return { acquired: false, ownerId: owner, fencingToken: null, handle: null };
  }
}

export async function releaseLock(key: string, ownerId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    logger.warn('Redis not ready, skip lock release', { component: 'distributed-lock', lockKey: key, ownerId, redisStatus: redis.status });
    activeLocks.delete(key);
    return false;
  }

  const redisKey = `lock:${key}`;

  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        redis.call("del", KEYS[2])
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 2, redisKey, `${redisKey}:meta`, ownerId);
    const released = result === 1;

    if (released) {
      activeLocks.delete(key);
      logger.info('Lock released', { component: 'distributed-lock', lockKey: key, ownerId });
    } else {
      logger.warn('Lock release denied', { component: 'distributed-lock', lockKey: key, ownerId });
    }

    return released;
  } catch (err) {
    logger.error('Redis error releasing lock', err, { component: 'distributed-lock', lockKey: key, ownerId });
    return false;
  }
}

export async function extendLock(
  key: string,
  ownerId: string,
  additionalSeconds: number = 300,
): Promise<boolean> {
  if (!isRedisConnected()) return false;

  const redisKey = `lock:${key}`;

  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        redis.call("pexpire", KEYS[2], ARGV[2])
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 2, redisKey, `${redisKey}:meta`, ownerId, additionalSeconds * 1000);
    const extended = result === 1;
    const handle = activeLocks.get(key);
    if (extended && handle) handle.expiresAt = Date.now() + additionalSeconds * 1000;
    return extended;
  } catch (err) {
    logger.error('Redis error extending lock', err, { component: 'distributed-lock', lockKey: key, ownerId });
    return false;
  }
}

export async function getLockStatus(key: string): Promise<{ held: boolean; owner: string | null; ttlMs: number | null; fencingToken: number | null }> {
  if (!isRedisConnected()) return { held: false, owner: null, ttlMs: null, fencingToken: null };

  try {
    const redisKey = `lock:${key}`;
    const [owner, ttl, token] = await Promise.all([
      redis.get(redisKey),
      redis.pttl(redisKey),
      redis.hget(`${redisKey}:meta`, 'token'),
    ]);
    return {
      held: owner !== null,
      owner,
      ttlMs: ttl >= 0 ? ttl : null,
      fencingToken: token ? Number(token) : null,
    };
  } catch {
    return { held: false, owner: null, ttlMs: null, fencingToken: null };
  }
}

export async function cleanupStaleLock(key: string, maxAgeMs: number = 60_000): Promise<boolean> {
  if (!isRedisConnected()) return false;

  const redisKey = `lock:${key}`;

  try {
    const owner = await redis.get(redisKey);
    if (!owner) return true;

    const parts = owner.split(':');
    if (parts.length < 2) return false;

    const lockTimestamp = parseInt(parts[1], 10);
    const age = Date.now() - lockTimestamp;

    if (age > maxAgeMs) {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          redis.call("del", KEYS[2])
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await redis.eval(script, 2, redisKey, `${redisKey}:meta`, owner);
      logger.warn('Cleaned stale lock', { component: 'distributed-lock', lockKey: key, ownerId: owner, ageMs: age, result });
      return result === 1;
    }

    return false;
  } catch (err) {
    logger.error('Redis error cleaning stale lock', err, { component: 'distributed-lock', lockKey: key });
    return false;
  }
}

export function getActiveLocks(): Record<string, { ownerId: string; fencingToken: number; ageMs: number; expiresInMs: number }> {
  const result: Record<string, { ownerId: string; fencingToken: number; ageMs: number; expiresInMs: number }> = {};
  for (const [key, handle] of activeLocks) {
    result[key] = {
      ownerId: handle.ownerId,
      fencingToken: handle.fencingToken,
      ageMs: Date.now() - handle.acquiredAt,
      expiresInMs: Math.max(0, handle.expiresAt - Date.now()),
    };
  }
  return result;
}
