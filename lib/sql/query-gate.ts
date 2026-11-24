/**
 * Concurrency gate untuk komputasi cache-miss dan pekerjaan tulis berat.
 * Mencegah banyak cache-key cold / job tulis menembak MySQL serentak dan
 * menghabiskan pool koneksi Prisma — insiden yang pernah terjadi: 6 widget
 * dashboard cold bersamaan, masing-masing 30-60 detik, pool habis, bahkan
 * `SELECT 1` ikut timeout.
 *
 * Sejak insiden 2026-11, gate dipisah menjadi dua kolam:
 * - `read`  : query dashboard/route (interactive vs background).
 * - `write` : ingestion, projection, status refresh, backfill.
 * Pemisahan ini mencegah satu batch ingestion 30-60 detik memblokir semua
 * halaman read, dan sebaliknya halaman read yang cold tidak bisa menghabiskan
 * jatah konkurensi writer.
 *
 * Semaphore FIFO lokal membatasi antrean di satu proses. Saat Redis siap,
 * slot Redis tambahan menerapkan batas yang sama lintas proses web dan worker.
 * Jika Redis tidak siap, operasi memakai batas lokal sebagai mode degradasi.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { redis, isRedisReady } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

function envInt(names: string[], fallback: number): number {
  for (const name of names) {
    const parsed = parseInt(process.env[name] ?? '', 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

// `CACHE_COMPUTE_CONCURRENCY` tetap dibaca agar deployment lama (dan test)
// tidak perlu mengubah ENV saat upgrade.
const READ_CONCURRENCY = envInt(
  [
    'DATABASE_READ_QUERY_CONCURRENCY',
    'DATABASE_HEAVY_QUERY_CONCURRENCY',
    'CACHE_COMPUTE_CONCURRENCY',
  ],
  6,
);
const WRITE_CONCURRENCY = envInt(
  ['DATABASE_WRITE_QUERY_CONCURRENCY'],
  Math.max(1, Math.min(2, READ_CONCURRENCY)),
);
const MAX_WAIT_MS = envInt(
  ['DATABASE_QUERY_GATE_WAIT_MS', 'CACHE_COMPUTE_WAIT_MS'],
  10_000,
);
// Batas slot Redis lintas proses. Nilainya harus SAMA di semua app (web dan
// worker): kalau tiap proses memakai batas lokalnya sendiri, worker dengan
// batas 2 hanya mencoba slot 0-1 sementara web memakai 0-5, sehingga slot
// bebas tidak pernah terpakai. Default mengikuti batas lokal.
const SHARED_READ_SLOTS = envInt(
  ['DATABASE_SHARED_READ_QUERY_CONCURRENCY'],
  READ_CONCURRENCY,
);
const SHARED_WRITE_SLOTS = envInt(
  ['DATABASE_SHARED_WRITE_QUERY_CONCURRENCY'],
  WRITE_CONCURRENCY,
);
// User boleh menunggu lebih lama daripada refresh background: halaman yang
// cache-nya benar-benar hilang tidak punya data lama untuk ditampilkan.
const INTERACTIVE_WAIT_MS = envInt(
  ['DATABASE_INTERACTIVE_QUERY_GATE_WAIT_MS'],
  15_000,
);
const SHARED_SLOT_PREFIX = 'dompis:database-heavy-query-slot';
const SHARED_SLOT_TTL_MS = 90_000;
const SHARED_SLOT_RENEW_MS = 25_000;
const MAX_HOLDER_SNAPSHOT = 5;

export type QueryPriority = 'interactive' | 'background';
export type QueryKind = 'read' | 'write';

export interface QueryGateHolder {
  label: string;
  priority: QueryPriority;
  elapsedMs: number;
}

export interface QueryGateTimeoutDetails {
  waitMs: number;
  kind: QueryKind;
  priority: QueryPriority;
  label?: string;
  queueDepth: number;
  active: number;
  holders: QueryGateHolder[];
  [key: string]: unknown;
}

export class QueryGateTimeoutError extends Error {
  readonly status = 503;
  readonly kind: QueryKind;
  readonly priority: QueryPriority;
  readonly waitMs: number;
  readonly queueDepth: number;
  readonly active: number;
  readonly holders: QueryGateHolder[];

  constructor(waitMs: number, details: Partial<QueryGateTimeoutDetails> = {}) {
    super(`Database query gate wait exceeded ${waitMs}ms`);
    this.name = 'QueryGateTimeoutError';
    this.waitMs = waitMs;
    this.kind = details.kind ?? 'read';
    this.priority = details.priority ?? 'background';
    this.queueDepth = details.queueDepth ?? 0;
    this.active = details.active ?? 0;
    this.holders = details.holders ?? [];
  }
}

interface PoolState {
  active: number;
  activeBackground: number;
  queues: Record<QueryPriority, Array<() => void>>;
}

const pools: Record<QueryKind, PoolState> = {
  read: { active: 0, activeBackground: 0, queues: { interactive: [], background: [] } },
  write: { active: 0, activeBackground: 0, queues: { interactive: [], background: [] } },
};

let nextHolderId = 1;
const holders = new Map<number, { label: string; priority: QueryPriority; kind: QueryKind; startedAt: number }>();
const ownership = new AsyncLocalStorage<{ active: boolean; priority: QueryPriority; kind: QueryKind }>();

function poolLimit(kind: QueryKind): number {
  return kind === 'write' ? WRITE_CONCURRENCY : READ_CONCURRENCY;
}

function waitBudget(priority: QueryPriority, requestedWaitMs?: number): number {
  return Math.max(
    1,
    requestedWaitMs ?? (priority === 'interactive' ? INTERACTIVE_WAIT_MS : MAX_WAIT_MS),
  );
}

function canAcquire(kind: QueryKind, priority: QueryPriority): boolean {
  const pool = pools[kind];
  const limit = poolLimit(kind);
  // Kolam write tidak butuh slot khusus interactive; kolam read menyisihkan
  // satu slot agar dashboard tetap bisa jalan saat refresh background padat.
  if (kind === 'write') return pool.active < limit;
  const backgroundLimit = Math.max(1, limit - 1);
  return pool.active < limit && (priority === 'interactive' || pool.activeBackground < backgroundLimit);
}

function markAcquired(kind: QueryKind, priority: QueryPriority): void {
  const pool = pools[kind];
  pool.active++;
  if (priority === 'background') pool.activeBackground++;
}

function snapshotHolders(kind: QueryKind): QueryGateHolder[] {
  const now = Date.now();
  return [...holders.values()]
    .filter((holder) => holder.kind === kind)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, MAX_HOLDER_SNAPSHOT)
    .map((holder) => ({
      label: holder.label,
      priority: holder.priority,
      elapsedMs: now - holder.startedAt,
    }));
}

function registerHolder(kind: QueryKind, priority: QueryPriority, label?: string): number {
  const id = nextHolderId++;
  holders.set(id, {
    label: label?.slice(0, 120) || 'unnamed',
    priority,
    kind,
    startedAt: Date.now(),
  });
  return id;
}

function acquire(
  kind: QueryKind,
  priority: QueryPriority,
  requestedWaitMs?: number,
  label?: string,
): Promise<number> {
  const pool = pools[kind];
  const waitMs = waitBudget(priority, requestedWaitMs);

  if (canAcquire(kind, priority)) {
    markAcquired(kind, priority);
    return Promise.resolve(registerHolder(kind, priority, label));
  }

  return new Promise((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer);
      markAcquired(kind, priority);
      resolve(registerHolder(kind, priority, label));
    };
    const timer = setTimeout(() => {
      const index = pool.queues[priority].indexOf(grant);
      if (index >= 0) pool.queues[priority].splice(index, 1);
      const details: QueryGateTimeoutDetails = {
        waitMs,
        kind,
        priority,
        label,
        queueDepth: pool.queues[priority].length,
        active: pool.active,
        holders: snapshotHolders(kind),
      };
      logger.warn('Database query gate timeout', details);
      reject(new QueryGateTimeoutError(waitMs, details));
    }, waitMs);
    pool.queues[priority].push(grant);
  });
}

function release(kind: QueryKind, priority: QueryPriority, holderId: number): void {
  holders.delete(holderId);
  const pool = pools[kind];
  pool.active = Math.max(0, pool.active - 1);
  if (priority === 'background') pool.activeBackground = Math.max(0, pool.activeBackground - 1);
  const nextPriority: QueryPriority | null = pool.queues.interactive.length > 0
    ? 'interactive'
    : canAcquire(kind, 'background') && pool.queues.background.length > 0
      ? 'background'
      : null;
  if (nextPriority) pool.queues[nextPriority].shift()?.();
}

async function acquireSharedSlot(
  kind: QueryKind,
  priority: QueryPriority,
  requestedWaitMs?: number,
): Promise<(() => Promise<void>) | null> {
  // Redis is an admission-control enhancement. Keep the existing local gate
  // available when Redis is down so dashboard reads can still serve.
  if (!isRedisReady()) return null;

  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const waitMs = waitBudget(priority, requestedWaitMs);
  const deadline = Date.now() + waitMs;
  let slotKey: string | null = null;

  while (Date.now() < deadline && !slotKey) {
    try {
      // Keep one shared slot available to user-facing reads while background
      // jobs (projection/ingestion/cache refresh) are running.
      const slotLimit = kind === 'write'
        ? SHARED_WRITE_SLOTS
        : priority === 'background'
          ? Math.max(1, SHARED_READ_SLOTS - 1)
          : SHARED_READ_SLOTS;
      for (let slot = 0; slot < slotLimit; slot++) {
        const key = `${SHARED_SLOT_PREFIX}:${kind}:${slot}`;
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

  if (!slotKey) {
    const details: QueryGateTimeoutDetails = {
      waitMs,
      kind,
      priority,
      queueDepth: pools[kind].queues[priority].length,
      active: pools[kind].active,
      holders: snapshotHolders(kind),
    };
    logger.warn('Database shared query slot timeout', details);
    throw new QueryGateTimeoutError(waitMs, details);
  }

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
 *
 * `kind: 'write'` wajib dipakai untuk ingestion/projection/status refresh.
 * `label` hanya untuk observability: dipakai saat timeout agar log menyebut
 * query/job mana yang menahan slot.
 */
export async function withQueryGate<T>(
  fn: () => Promise<T>,
  priorityOption: QueryPriority = 'background',
  options: { waitTimeoutMs?: number; kind?: QueryKind; label?: string } = {},
): Promise<T> {
  const kind = options.kind ?? 'read';
  // Writer selalu background: tidak ada pekerjaan tulis yang boleh
  // "menyalip" hanya karena dipanggil dari request user.
  const priority: QueryPriority = kind === 'write' ? 'background' : priorityOption;

  // A cached request can call another cache; its parent already owns a slot
  // of the same kind. A write nested inside a read (or vice versa) must still
  // acquire its own slot so writer work cannot ride a reader slot.
  const parent = ownership.getStore();
  if (parent?.active && parent.kind === kind) return fn();

  const waitMs = waitBudget(priority, options.waitTimeoutMs);
  const waitDeadline = Date.now() + waitMs;
  const holderId = await acquire(kind, priority, waitMs, options.label);
  const owner = { active: true, priority, kind };
  let releaseShared: (() => Promise<void>) | null = null;
  try {
    const sharedWaitMs = Math.max(1, waitDeadline - Date.now());
    releaseShared = await acquireSharedSlot(kind, priority, sharedWaitMs);
    return await ownership.run(owner, fn);
  } finally {
    owner.active = false;
    await releaseShared?.();
    release(kind, priority, holderId);
  }
}
