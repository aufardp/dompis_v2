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

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.CACHE_COMPUTE_CONCURRENCY || '6', 10) || 6,
);

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active++;
      resolve();
    });
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
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
