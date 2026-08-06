import { logger } from '@/lib/observability/logger';
import { isRedisReady, redis } from '@/lib/redis';
import { prisma } from '@/app/libs/prisma';

const DLQ_PREFIX = 'dlq:integration:';
const DLQ_TTL = 7 * 86400;

export interface DlqEntry {
  id: string;
  source: string;
  payload: string;
  error: string;
  failedAt: string;
  retryCount: number;
}

export async function quarantine(
  source: string,
  payload: unknown,
  error: unknown,
): Promise<void> {
  if (!isRedisReady()) return;

  const id = `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: DlqEntry = {
    id,
    source,
    payload: JSON.stringify(payload),
    error: String(error).slice(0, 1000),
    failedAt: new Date().toISOString(),
    retryCount: 0,
  };

  try {
    await redis.zadd(`${DLQ_PREFIX}${source}`, Date.now(), JSON.stringify(entry));
    await redis.expire(`${DLQ_PREFIX}${source}`, DLQ_TTL);
    logger.warn(`[DLQ] Quarantined item:`, { source, id, error: String(error).slice(0, 200) });
  } catch (err) {
    logger.warn('[DLQ] Failed to quarantine item:', { source, error: String(err) });
  }
}

export async function retryQuarantined(
  source: string,
  maxItems = 50,
): Promise<{ recovered: number; failed: number; purged: number }> {
  if (!isRedisReady()) return { recovered: 0, failed: 0, purged: 0 };

  const key = `${DLQ_PREFIX}${source}`;
  const raw = await redis.zrange(key, 0, maxItems - 1);
  if (raw.length === 0) return { recovered: 0, failed: 0, purged: 0 };

  let recovered = 0;
  let failed = 0;
  let purged = 0;

  for (const item of raw) {
    try {
      const entry: DlqEntry = JSON.parse(item);
      entry.retryCount++;

      // Projection: pemulihan asli ditangani oleh cooldown di fetchBatch
      // (row gagal di-skip sementara lalu otomatis dicoba lagi). Di sini hanya
      // purge entry yang row-nya sudah berhasil diproyeksi / sudah tidak aktif.
      if (source === 'projection') {
        if (!(await isProjectionDlqStale(entry))) continue;
        const removed = await redis.zrem(key, item);
        if (removed === 0) continue;
        purged++;
        logger.info('[DLQ] Purged stale projection item:', {
          source,
          id: entry.id,
          retryCount: entry.retryCount,
        });
        continue;
      }

      const removed = await redis.zrem(key, item);
      if (removed === 0) continue;

      if (entry.retryCount > 5) {
        logger.warn('[DLQ] Item exceeded max retries, dropping:', { source, id: entry.id });
        failed++;
        continue;
      }

      logger.info('[DLQ] Item recovered (requeued for retry):', { source, id: entry.id, retryCount: entry.retryCount });
      recovered++;
    } catch {
      await redis.zrem(key, item).catch(() => {});
      failed++;
    }
  }

  return { recovered, failed, purged };
}

async function isProjectionDlqStale(entry: DlqEntry): Promise<boolean> {
  try {
    const payload =
      typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
    const itemId = payload?.itemId as string | undefined;
    if (!itemId) return false;

    const log = await prisma.ticket_projection_log.findUnique({
      where: { ticketRawId: itemId },
      select: { status: true },
    });
    if (log?.status === 'success') return true;

    const raw = await prisma.ticket_raw.findUnique({
      where: { id_ticket: itemId },
      select: { isActive: true },
    });
    return !raw || !raw.isActive;
  } catch {
    return false;
  }
}

export async function getQuarantineCount(source: string): Promise<number> {
  if (!isRedisReady()) return 0;
  try {
    return await redis.zcard(`${DLQ_PREFIX}${source}`);
  } catch {
    return 0;
  }
}

export async function getQuarantineSources(): Promise<string[]> {
  if (!isRedisReady()) return [];
  try {
    const keys = await redis.keys(`${DLQ_PREFIX}*`);
    return keys.map((k: string) => k.replace(DLQ_PREFIX, ''));
  } catch {
    return [];
  }
}
