import { fetchByIncidentAnyStatus } from '@/lib/external-db/qosmic-bridge/nossa';
import { processRawRows, type ChunkResult } from './index';
import { logger } from '@/lib/observability/logger';
import { projectSingleTicket } from '@/lib/projection/single';
import { acquireLock, extendLock, getLockStatus, releaseLock } from '@/lib/distributed-lock';
import { isRedisReady } from '@/lib/redis';

const SINGLE_INGESTION_LOCK_TTL_SECONDS = 300;
const SINGLE_INGESTION_MAX_WAIT_MS = 120_000;

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withIncidentLock<T>(incident: string, task: () => Promise<T>): Promise<T> {
  const lockKey = `single-incident-ingestion:${encodeURIComponent(incident)}`;
  const deadline = Date.now() + SINGLE_INGESTION_MAX_WAIT_MS;
  let ownerId: string | null = null;

  while (Date.now() < deadline) {
    if (!isRedisReady()) throw new Error('Redis unavailable; refusing duplicate incident ingestion');
    const status = await getLockStatus(lockKey);
    if (status.held) {
      await wait(Math.min(Math.max(status.ttlMs ?? 1000, 250), 5000));
      continue;
    }
    const lock = await acquireLock(lockKey, SINGLE_INGESTION_LOCK_TTL_SECONDS);
    if (lock.acquired) {
      ownerId = lock.ownerId;
      break;
    }
    await wait(500);
  }

  if (!ownerId) throw new Error(`Timed out waiting for single incident lock: ${incident}`);

  let lockLost = false;
  const heartbeat = setInterval(() => {
    void extendLock(lockKey, ownerId!, SINGLE_INGESTION_LOCK_TTL_SECONDS).then((extended) => {
      if (!extended) lockLost = true;
    }).catch(() => { lockLost = true; });
  }, Math.floor(SINGLE_INGESTION_LOCK_TTL_SECONDS * 1000 / 3));
  heartbeat.unref?.();

  try {
    const result = await task();
    if (lockLost) throw new Error(`Lost single incident lock: ${incident}`);
    return result;
  } finally {
    clearInterval(heartbeat);
    await releaseLock(lockKey, ownerId);
  }
}

export async function ingestSingleIncident(incidentId: string): Promise<{
  success: boolean;
  message: string;
  result?: ChunkResult;
  retryable?: boolean;
}> {
  const cleanId = incidentId.trim().toUpperCase();
  if (!cleanId) {
    return { success: false, message: 'Incident ID tidak boleh kosong' };
  }
  if (cleanId.length > 100) {
    return { success: false, message: 'Incident ID melebihi batas 100 karakter' };
  }

  try {
    return await withIncidentLock(cleanId, async () => {
    logger.info('[SingleIngestion] Fetching incident from Bridge:', { incident: cleanId });
    const fetched = await fetchByIncidentAnyStatus(cleanId);

    if (!fetched || !fetched.row) {
      return { success: false, message: `Insiden ${cleanId} tidak ditemukan di sistem eksternal (Nossa)` };
    }

    const { resource, row } = fetched;
    const batchId = `manual-single-${Date.now()}`;
    const chunkResult: ChunkResult = {
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      retried: 0,
      errors: [],
    };

    const cursorDef = {
      idColumn: null,
      modifiedColumn: null,
      createdAtColumn: null,
      strategy: 'snapshot' as const,
      columns: [],
    };

    // Jalankan pipeline ingestion baku (normalisasi + validasi + cek duplikasi hash/identity)
    await processRawRows([row], resource, batchId, cursorDef, chunkResult);
    if (chunkResult.quarantined || chunkResult.failed) {
      return { success: false, message: 'Data sumber memerlukan pemeriksaan sebelum dapat diterapkan', result: chunkResult };
    }

    // Jalankan projection langsung untuk batch ini
    logger.info('[SingleIngestion] Triggering direct projection', { incident: cleanId, batchId });
    const projectionResult = await projectSingleTicket(cleanId);
    logger.info('[SingleIngestion] Direct projection complete', { incident: cleanId, batchId, result: projectionResult });

    return {
      success: true,
      message: `Berhasil memproses insiden ${cleanId} dari tabel ${resource}. (Inserted: ${chunkResult.inserted}, Updated: ${chunkResult.updated}, Skipped: ${chunkResult.skipped})`,
      result: chunkResult,
    };
    });
  } catch (error) {
    logger.error('[SingleIngestion] Gagal menarik insiden:', { incident: cleanId, error: String(error) });
    return {
      success: false,
      retryable: true,
      message: `Gagal menarik insiden: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
