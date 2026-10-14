import { fetchByIncidentAnyStatus } from '@/lib/external-db/qosmic-bridge/nossa';
import { processRawRows, type ChunkResult } from './index';
import { logger } from '@/lib/observability/logger';
import { runProjection } from '@/lib/projection';

export async function ingestSingleIncident(incidentId: string): Promise<{ success: boolean; message: string; result?: ChunkResult }> {
  const cleanId = incidentId.trim();
  if (!cleanId) {
    return { success: false, message: 'Incident ID tidak boleh kosong' };
  }

  try {
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

    // Jalankan projection langsung untuk batch ini
    logger.info('[SingleIngestion] Triggering direct projection', { incident: cleanId, batchId });
    const projectionResult = await runProjection(undefined, {
      mode: 'batch',
      syncBatchId: batchId,
      preserveCheckpointCursor: true,
    });
    logger.info('[SingleIngestion] Direct projection complete', { incident: cleanId, batchId, result: projectionResult });

    return {
      success: true,
      message: `Berhasil memproses insiden ${cleanId} dari tabel ${resource}. (Inserted: ${chunkResult.inserted}, Updated: ${chunkResult.updated}, Skipped: ${chunkResult.skipped}, Projected: ${projectionResult.inserted} ins, ${projectionResult.updated} upd)`,
      result: chunkResult,
    };
  } catch (error) {
    logger.error('[SingleIngestion] Gagal menarik insiden:', { incident: cleanId, error: String(error) });
    return { success: false, message: `Gagal menarik insiden: ${error instanceof Error ? error.message : String(error)}` };
  }
}
