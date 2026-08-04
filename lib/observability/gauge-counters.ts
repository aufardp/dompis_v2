import { isRedisReady, redis } from '@/lib/redis';

/**
 * Redis mirror counter untuk metrik yang mahal dihitung via COUNT(*) di DB.
 *
 * Background: `tech_event_outbox` dan `ingestion_quarantine` bisa sangat besar.
 * COUNT() di hot path (mis. health monitoring yang di-poll tiap detik) menggantung
 * koneksi pool Prisma berjam-jam → pool habis → server down (insiden RTO).
 *
 * Strategi:
 * - Mutasi (create/dispatch/finalize) menambah/mengurangi counter di sini secara
 *   atomik (INCRBY). Health endpoint cukup baca Redis (O(1), ~1ms).
 * - Worker melakukan reconcile berkala untuk memperbaiki drift jika ada.
 * - Best-effort: jika Redis offline, semua operasi no-op dan health fallback ke 0.
 */

export const OUTBOX_PENDING_KEY = 'gauge:outbox_pending';
export const INGESTION_QUARANTINE_KEY = 'gauge:ingestion_quarantine';

async function adjust(key: string, delta: number): Promise<void> {
  if (!isRedisReady() || delta === 0) return;
  try {
    const result = await redis.incrby(key, delta);
    if (result < 0) await redis.set(key, '0');
  } catch {
    // best-effort; reconcile worker memperbaiki drift
  }
}

export async function incrOutboxPending(count: number = 1): Promise<void> {
  await adjust(OUTBOX_PENDING_KEY, count);
}

export async function decrOutboxPending(count: number = 1): Promise<void> {
  await adjust(OUTBOX_PENDING_KEY, -count);
}

export async function incrIngestionQuarantine(count: number = 1): Promise<void> {
  await adjust(INGESTION_QUARANTINE_KEY, count);
}

export async function decrIngestionQuarantine(count: number = 1): Promise<void> {
  await adjust(INGESTION_QUARANTINE_KEY, -count);
}

export async function setGaugeValue(key: string, value: number): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.set(key, String(Math.max(0, value)));
  } catch {
    // best-effort
  }
}

export async function setOutboxPendingCount(value: number): Promise<void> {
  await setGaugeValue(OUTBOX_PENDING_KEY, value);
}

export async function setIngestionQuarantineCount(value: number): Promise<void> {
  await setGaugeValue(INGESTION_QUARANTINE_KEY, value);
}

export async function getGaugeValue(key: string): Promise<number> {
  if (!isRedisReady()) return 0;
  try {
    const raw = await redis.get(key);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    return 0;
  }
}

export async function getOutboxPendingCount(): Promise<number> {
  return getGaugeValue(OUTBOX_PENDING_KEY);
}

export async function getIngestionQuarantineCount(): Promise<number> {
  return getGaugeValue(INGESTION_QUARANTINE_KEY);
}

export async function reconcileGaugeCounters(options: {
  outboxPending?: number;
  ingestionQuarantine?: number;
}): Promise<void> {
  if (options.outboxPending !== undefined) {
    await setOutboxPendingCount(options.outboxPending);
  }
  if (options.ingestionQuarantine !== undefined) {
    await setIngestionQuarantineCount(options.ingestionQuarantine);
  }
}
