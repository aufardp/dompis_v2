import { logger } from '@/lib/observability/logger';
import redis, { ensureRedisReady } from '@/lib/redis';
import { gzipSync, gunzipSync } from 'node:zlib';

export interface CacheOptions {
  ttl?: number;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const TICKETS_CACHE_TTL = parsePositiveIntEnv('TICKETS_CACHE_TTL', 15);
export const DASHBOARD_CACHE_TTL = parsePositiveIntEnv('DASHBOARD_CACHE_TTL', 30);
export const DASHBOARD_SUMMARY_CACHE_TTL = parsePositiveIntEnv('DASHBOARD_SUMMARY_CACHE_TTL', 300);
export const STATS_CACHE_TTL = parsePositiveIntEnv('STATS_CACHE_TTL', 30);

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
    if (!data) return null;
    const raw = data.startsWith('gz:') ? decodeCompressedPayload(data) : data;
    return JSON.parse(raw) as T;
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
 *
 * Secara default cache `dashboard:*` TIDAK dihapus: siklus otomatis
 * (status-refresh/active-refresh/sync-metrics) berjalan tiap 1–2 menit dan
 * dulu selalu menghapus dashboard:* sehingga TTL panjang tidak pernah
 * terpakai dan semua user recompute query berat bersamaan (pool exhaustion).
 * Dashboard sekarang pakai getOrSetCacheSwr yang menyegarkan diri sendiri;
 * purge dashboard hanya untuk aksi eksplisit user (includeDashboard: true).
 */
export async function invalidateTicketsCache(
  options: { includeDashboard?: boolean } = {},
): Promise<void> {
  if (!(await ensureRedisReady())) return;

  try {
    const patterns: string[] = ['tickets:*', 'daily_tickets:*', 'stats:*'];
    if (options.includeDashboard) {
      patterns.push('dashboard:*', 'dashboard_operations_summary:*');
    }
    // Jalankan semua pola SCAN secara paralel — masing-masing pakai pipeline sendiri.
    await Promise.all(patterns.map((p) => deleteCachePattern(p)));
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
 * Invalidate semua cache war map (points bbox/filter) setelah ada tagging baru.
 * Fire-and-forget — dipanggil dari broadcastWarMapUpsert via SSE.
 */
export async function invalidateWarMapCache(): Promise<void> {
  if (!(await ensureRedisReady())) return;

  try {
    await deleteCachePattern('war-map:*');
  } catch (error) {
    logger.warn('[Cache] Operation failed:', { error: String(error) });
  }
}

/**
 * In-flight map untuk single-flight cache-aside.
 * Mencegah request konkuren memanggil fn() berulang kali saat cache miss
 * (mis. snapshot health yang mahal) — cukup satu komputasi, sisanya menunggu.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Cache-aside helper: ambil dari cache, jika miss jalankan fn() lalu simpan.
 *
 * Single-flight: saat cache miss, request lain yang datang untuk key yang sama
 * menunggu komputasi yang sedang berjalan, bukan memulai komputasi baru.
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

  // Single-flight: kalau ada komputasi in-flight untuk key yang sama, ikuti.
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const computation = (async () => {
    try {
      const data = await fn();
      // Simpan nilai MENTAH — konsumen getOrSetCache tidak mengenal envelope.
      await setCache(key, data, ttl);
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, computation);
  return computation;
}

/**
 * Faktor umur maksimum entry SWR relatif terhadap ttl fresh-nya.
 * Entry basi tetap dilayani instan sampai ttl * SWR_STALE_FACTOR,
 * sambil di-recompute di background.
 */
const SWR_STALE_FACTOR = parsePositiveIntEnv('SWR_STALE_FACTOR', 3);

interface SwrEnvelope<T> {
  __swr: true;
  storedAt: number;
  data: T;
}

function isSwrEnvelope<T>(value: unknown): value is SwrEnvelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SwrEnvelope<T>).__swr === true &&
    typeof (value as SwrEnvelope<T>).storedAt === 'number'
  );
}

async function computeAndStoreSwr<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number,
  storeTtl: number,
): Promise<T> {
  try {
    const data = await fn();
    await setCache(
      key,
      { __swr: true, storedAt: Date.now(), data } satisfies SwrEnvelope<T>,
      storeTtl,
    );
    return data;
  } finally {
    inFlight.delete(key);
  }
}

function revalidateInBackground<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number,
): void {
  if (inFlight.has(key)) return;

  const computation = (async () => {
    try {
      const data = await fn();
      await setCache(
        key,
        { __swr: true, storedAt: Date.now(), data } satisfies SwrEnvelope<T>,
        ttl * SWR_STALE_FACTOR,
      );
    } catch (error) {
      logger.warn('[Cache] SWR background recompute failed:', {
        key,
        error: String(error),
      });
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, computation);
}

/**
 * Cache-aside dengan stale-while-revalidate untuk query dashboard yang mahal.
 *
 * - Entry fresh (< ttl) → langsung dilayani.
 * - Entry basi (< ttl * SWR_STALE_FACTOR) → tetap dilayani instan dan
 *   recompute dijalankan di background (single-flight per key), sehingga
 *   user tidak pernah menunggu query berat dan beban DB rata sepanjang waktu.
 * - Entry hilang/expired total → komputasi sinkron seperti getOrSetCache.
 */
export async function getOrSetCacheSwr<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const staleTtl = ttl * SWR_STALE_FACTOR;
  const cached = await getCache<SwrEnvelope<T> | T>(key);

  if (cached !== null) {
    if (!isSwrEnvelope<T>(cached)) {
      // Nilai legacy dari getOrSetCache lama (tanpa envelope) — umurnya tidak
      // diketahui; layankan sekali lalu segarkan di background.
      revalidateInBackground(key, fn, ttl);
      return cached;
    }

    revalidateInBackgroundIfNeeded(cached.storedAt, key, fn, ttl);
    return cached.data;
  }

  // Ada komputasi in-flight untuk key ini (revalidate background atau cold
  // path lain) — tunggu selesai lalu baca hasilnya dari cache.
  const existing = inFlight.get(key);
  if (existing) {
    await existing.catch(() => {});
    const env = await getCache<SwrEnvelope<T>>(key);
    if (env && isSwrEnvelope<T>(env)) return env.data;
    // Komputasi in-flight gagal dan tidak meninggalkan nilai — fallback ke
    // komputasi sinkron di bawah.
  }

  return computeAndStoreSwr(key, fn, ttl, staleTtl);
}

function revalidateInBackgroundIfNeeded<T>(
  storedAt: number,
  key: string,
  fn: () => Promise<T>,
  ttl: number,
): void {
  const ageMs = Date.now() - storedAt;
  if (ageMs < ttl * 1000) return;
  revalidateInBackground(key, fn, ttl);
}
