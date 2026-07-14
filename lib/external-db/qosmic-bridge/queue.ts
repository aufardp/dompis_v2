// ==========================================
// QOSMIC Bridge — antrian concurrency-bounded
// ==========================================
// Rate limit 20 req/menit sudah dijaga di client.ts (Redis, cross-process).
// Queue ini adalah lapisan TAMBAHAN di level satu proses: membatasi jumlah
// request yang benar-benar "in-flight" bersamaan (mis. saat status-refresh
// mem-fetch puluhan incident), supaya:
//   1. Tidak membuka puluhan koneksi HTTP sekaligus lalu semuanya nunggu di
//      waitForRateLimitSlot() secara paralel (buang-buang memori/socket).
//   2. Panggilan `priority: 'interactive'` (pencarian tiket live di UI) bisa
//      dipotong antre di depan job background (ingestion/status-refresh),
//      supaya user tidak menunggu lama di belakang antrian sync.
//
// Ini BUKAN pengganti rate limiter Redis — cuma pengatur urutan & concurrency
// lokal per proses.

type Priority = 'interactive' | 'background';

interface QueueItem<T> {
  priority: Priority;
  enqueuedAt: number;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const MAX_CONCURRENT =
  Number.parseInt(process.env.QOSMIC_BRIDGE_MAX_CONCURRENT || '', 10) || 3;

let activeCount = 0;
const queue: QueueItem<unknown>[] = [];

function pickNext(): QueueItem<unknown> | undefined {
  // interactive selalu didahulukan; di dalam grup yang sama, FIFO (enqueuedAt).
  let bestIndex = -1;
  for (let i = 0; i < queue.length; i++) {
    if (bestIndex === -1) {
      bestIndex = i;
      continue;
    }
    const current = queue[i];
    const best = queue[bestIndex];
    if (current.priority === 'interactive' && best.priority !== 'interactive') {
      bestIndex = i;
    } else if (
      current.priority === best.priority &&
      current.enqueuedAt < best.enqueuedAt
    ) {
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return undefined;
  return queue.splice(bestIndex, 1)[0];
}

function pump(): void {
  while (activeCount < MAX_CONCURRENT) {
    const item = pickNext();
    if (!item) return;
    activeCount++;
    item
      .task()
      .then((result) => item.resolve(result))
      .catch((error) => item.reject(error))
      .finally(() => {
        activeCount--;
        pump();
      });
  }
}

/**
 * Jadwalkan satu panggilan ke QOSMIC Bridge lewat antrian bersama.
 *
 * Contoh: `enqueueBridgeCall(() => fetchByIncident('nossa', incident), 'background')`
 */
export function enqueueBridgeCall<T>(
  task: () => Promise<T>,
  priority: Priority = 'background',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      priority,
      enqueuedAt: Date.now(),
      task,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    pump();
  });
}

export function getBridgeQueueStats(): { queued: number; active: number } {
  return { queued: queue.length, active: activeCount };
}
