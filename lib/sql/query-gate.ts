/**
 * Concurrency gate untuk komputasi cache-miss (query dashboard berat via
 * getOrSetCache/getOrSetCacheSwr). Mencegah banyak cache-key yang cold di
 * waktu yang sama (mis. setelah TTL habis bersamaan, restart, atau outage)
 * menembak MySQL serentak dan menghabiskan pool koneksi Prisma dalam
 * hitungan detik — insiden yang pernah terjadi: 6 widget dashboard cold
 * bersamaan, masing-masing 30-60 detik, pool 35 koneksi habis, bahkan
 * `SELECT 1` ikut timeout.
 *
 * Semaphore FIFO lokal membatasi antrean di satu proses. Saat Redis siap,
 * slot Redis tambahan menerapkan batas yang sama lintas proses web dan worker.
 * Jika Redis tidak siap, operasi memakai batas lokal sebagai mode degradasi.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { redis, isRedisReady } from '@/lib/redis';

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(
    process.env.DATABASE_HEAVY_QUERY_CONCURRENCY ||
      process.env.CACHE_COMPUTE_CONCURRENCY || '6',
    10,
  ) || 6,
);
const MAX_WAIT_MS = Math.max(
  1,
  parseInt(
    process.env.DATABASE_QUERY_GATE_WAIT_MS ||
      process.env.CACHE_COMPUTE_WAIT_MS || '10000',
    10,
  ) || 10000,
);
const SHARED_SLOT_PREFIX = 'dompis:database-heavy-query-slot';
const SHARED_SLOT_TTL_MS = 90_000;
const SHARED_SLOT_RENEW_MS = 25_000;

export class QueryGateTimeoutError extends Error {
  readonly status = 503;

  constructor() {
    super(`Database query gate wait exceeded ${MAX_WAIT_MS}ms`);
    this.name = 'QueryGateTimeoutError';
  }
}

let active = 0;
const queue: Array<() => void> = [];
const ownership = new AsyncLocalStorage<{ active: boolean }>();

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer);
      active++;
      resolve();
    };
    const timer = setTimeout(() => {
      const index = queue.indexOf(grant);
      if (index >= 0) queue.splice(index, 1);
      reject(new QueryGateTimeoutError());
    }, MAX_WAIT_MS);
    queue.push(grant);
  });
}

function release(): void {
  active--;
  const next = queue.shift();
  if (next) next();
}

async function acquireSharedSlot(): Promise<(() => Promise<void>) | null> {
  // Redis is an admission-control enhancement. Keep the existing local gate
  // available when Redis is down so dashboard reads can still serve.
  if (!isRedisReady()) return null;

  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + MAX_WAIT_MS;
  let slotKey: string | null = null;

  while (Date.now() < deadline && !slotKey) {
    try {
      for (let slot = 0; slot < MAX_CONCURRENT; slot++) {
        const key = `${SHARED_SLOT_PREFIX}:${slot}`;
        const acquired = await redis.set(key, token, 'PX', SHARED_SLOT_TTL_MS, 'NX');
        if (acquired === 'OK') {
          slotKey = key;
          break;
        }
      }
    } catch {
      return null;
    }
    if (!slotKey) await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
  }

  if (!slotKey) throw new QueryGateTimeoutError();

  const ownedKey = slotKey;
  const renew = () => redis.eval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end',
    1,
    ownedKey,
    token,
    SHARED_SLOT_TTL_MS,
  ).then(() => undefined).catch(() => undefined);
  const renewTimer = setInterval(() => { void renew(); }, SHARED_SLOT_RENEW_MS);
  renewTimer.unref?.();

  return async () => {
    clearInterval(renewTimer);
    await redis.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      ownedKey,
      token,
    ).catch(() => undefined);
  };
}

/**
 * Jalankan `fn` di bawah gate konkurensi global. Kalau slot penuh, `fn`
 * menunggu antrean (FIFO) — bukan langsung menembak DB bersamaan dengan
 * komputasi lain yang sedang berjalan.
 */
export async function withQueryGate<T>(fn: () => Promise<T>): Promise<T> {
  // A cached request can call another cache; its parent already owns a slot.
  if (ownership.getStore()?.active) return fn();

  await acquire();
  const owner = { active: true };
  let releaseShared: (() => Promise<void>) | null = null;
  try {
    releaseShared = await acquireSharedSlot();
    return await ownership.run(owner, fn);
  } finally {
    owner.active = false;
    await releaseShared?.();
    release();
  }
}
