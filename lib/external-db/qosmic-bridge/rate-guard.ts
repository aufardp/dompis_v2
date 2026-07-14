// ==========================================
// Rate guard: batasi ingestion per menit
// ==========================================
// Bridge punya 20 req/menit global untuk semua pemakai.
// Setelah search pindah ke lokal, pemakai tinggal:
//   - ingestion (full scan nossa + incremental nossa_closed)
//   - status refresh (per-ticket lookup)
//
// Guard ini memastikan ingestion tidak menghabiskan semua slot,
// dengan batas maks per menit (default 14, sisanya untuk refresh).

import { logger } from '@/lib/observability/logger';

const INGESTION_MAX_PER_MIN = parseInt(
  process.env.QOSMIC_BRIDGE_INGESTION_MAX_PER_MIN || '14',
  10,
);

const counters = new Map<number, number>();

function getMinuteKey(): number {
  return Math.floor(Date.now() / 60_000);
}

/** Periksa apakah ingestion boleh lanjut. Jika tidak, sleep sampai menit depan. */
export async function waitForIngestionSlot(): Promise<void> {
  const maxWaitMs = 60_000;

  for (;;) {
    const key = getMinuteKey();
    const count = counters.get(key) ?? 0;

    if (count < INGESTION_MAX_PER_MIN) {
      counters.set(key, count + 1);
      return;
    }

    const waitMs = (key + 1) * 60_000 - Date.now();
    if (waitMs > maxWaitMs) {
      logger.warn('[RateGuard] Ingestion menunggu terlalu lama', {
        waitMs,
        currentCount: count,
        maxPerMin: INGESTION_MAX_PER_MIN,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5_000)));
  }
}

/** Hapus counter lama agar tidak bocor memori */
setInterval(() => {
  const now = Date.now();
  for (const [key] of counters) {
    if (key < Math.floor(now / 60_000) - 2) {
      counters.delete(key);
    }
  }
}, 120_000);
