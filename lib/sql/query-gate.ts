/**
 * Concurrency gate untuk komputasi cache-miss (query dashboard berat via
 * getOrSetCache/getOrSetCacheSwr). Mencegah banyak cache-key yang cold di
 * waktu yang sama (mis. setelah TTL habis bersamaan, restart, atau outage)
 * menembak MySQL serentak dan menghabiskan pool koneksi Prisma dalam
 * hitungan detik — insiden yang pernah terjadi: 6 widget dashboard cold
 * bersamaan, masing-masing 30-60 detik, pool 35 koneksi habis, bahkan
 * `SELECT 1` ikut timeout.
 *
 * Semaphore sederhana proses-lokal (bukan lintas-proses/Redis) — cukup
 * karena tiap app PM2 (dompis-server dkk) berjalan single-instance
 * (`instances: 1`), jadi gate ini memang mewakili seluruh proses.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.CACHE_COMPUTE_CONCURRENCY || '6', 10) || 6,
);
const MAX_WAIT_MS = Math.max(
  1,
  parseInt(process.env.CACHE_COMPUTE_WAIT_MS || '10000', 10) || 10000,
);

export class QueryGateTimeoutError extends Error {
  readonly status = 503;

  constructor() {
    super(`Cache computation queue wait exceeded ${MAX_WAIT_MS}ms`);
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
  try {
    return await ownership.run(owner, fn);
  } finally {
    owner.active = false;
    release();
  }
}
