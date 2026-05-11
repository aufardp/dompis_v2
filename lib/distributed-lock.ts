import { redis } from '@/lib/redis';

export type LockResult = 'acquired' | 'skipped' | 'error';

interface LockHandle {
  key: string;
  ownerId: string;
  acquiredAt: number;
}

const activeLocks = new Map<string, LockHandle>();

function generateOwnerId(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function isRedisConnected(): boolean {
  return redis.status === 'ready' || redis.status === 'connect' || redis.status === 'connecting';
}

export async function acquireLock(
  key: string,
  ttlSeconds: number = 300,
): Promise<{ acquired: boolean; ownerId: string; handle: LockHandle | null }> {
  if (!isRedisConnected()) {
    console.warn(`[DistLock] Redis not connected (status=${redis.status}) — key=${key} — failing open`);
    const fallbackOwner = generateOwnerId();
    return { acquired: true, ownerId: fallbackOwner, handle: null };
  }

  const owner = generateOwnerId();
  const redisKey = `lock:${key}`;

  try {
    const result = await redis.set(redisKey, owner, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
      const handle: LockHandle = { key, ownerId: owner, acquiredAt: Date.now() };
      activeLocks.set(key, handle);
      console.log(`[DistLock] Acquired key=${key} owner=${owner} ttl=${ttlSeconds}s`);
      return { acquired: true, ownerId: owner, handle };
    }

    const existing = await redis.get(redisKey);
    if (existing) {
      console.log(`[DistLock] Lock held by other process key=${key} owner=${existing}`);
    }

    return { acquired: false, ownerId: owner, handle: null };
  } catch (err) {
    console.error(`[DistLock] Redis error acquiring key=${key}:`, err);
    return { acquired: false, ownerId: owner, handle: null };
  }
}

export async function releaseLock(key: string, ownerId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    console.warn(`[DistLock] Redis not connected (status=${redis.status}) — key=${key} — skip release`);
    activeLocks.delete(key);
    return false;
  }

  const redisKey = `lock:${key}`;

  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 1, redisKey, ownerId);
    const released = result === 1;

    if (released) {
      activeLocks.delete(key);
      console.log(`[DistLock] Released key=${key} owner=${ownerId}`);
    } else {
      console.warn(`[DistLock] Release denied — key=${key} owner=${ownerId} (not owner or expired)`);
    }

    return released;
  } catch (err) {
    console.error(`[DistLock] Redis error releasing key=${key}:`, err);
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
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 1, redisKey, ownerId, additionalSeconds * 1000);
    return result === 1;
  } catch (err) {
    console.error(`[DistLock] Redis error extending key=${key}:`, err);
    return false;
  }
}

export async function getLockStatus(key: string): Promise<{ held: boolean; owner: string | null }> {
  if (!isRedisConnected()) return { held: false, owner: null };

  try {
    const owner = await redis.get(`lock:${key}`);
    return { held: owner !== null, owner };
  } catch {
    return { held: false, owner: null };
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
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await redis.eval(script, 1, redisKey, owner);
      console.log(`[DistLock] Cleaned stale lock key=${key} age=${age}ms result=${result}`);
      return result === 1;
    }

    return false;
  } catch (err) {
    console.error(`[DistLock] Redis error cleaning stale key=${key}:`, err);
    return false;
  }
}

export function getActiveLocks(): Record<string, { ownerId: string; ageMs: number }> {
  const result: Record<string, { ownerId: string; ageMs: number }> = {};
  for (const [key, handle] of activeLocks) {
    result[key] = {
      ownerId: handle.ownerId,
      ageMs: Date.now() - handle.acquiredAt,
    };
  }
  return result;
}