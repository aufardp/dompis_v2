import { logger } from '@/lib/observability/logger';
import { prisma } from '@/app/libs/prisma';
import { normalizeExternalRow, computeSourceHash } from './normalizer';
import { lockTicketSyncState } from './sync-state';
import { incrIngestionQuarantine } from '@/lib/observability/gauge-counters';
import type { ExternalRow } from '@/lib/external-db/types';

export function isRowDataError(error: unknown): boolean {
  const column = String(error).match(/for column ['`]([^'`]+)['`]/i)?.[1];
  if (column && ['syncBatchId', 'lastSuccessfulBatchId', 'import_batch', 'tableName', 'batchId', 'sourceFamily', 'resource', 'sourceHash'].includes(column)) return false;
  return /1406|data too long|1118|row size too large|1366|incorrect string value|1048|cannot be null/i.test(String(error));
}

export async function quarantineRejectedRow(row: Record<string, unknown>, source: string, batchId: string, error: unknown): Promise<void> {
  const normalized = normalizeExternalRow(row as ExternalRow, source);
  const hash = computeSourceHash(normalized);
  const inserted = await prisma.$transaction(async tx => {
    if (normalized.incident) await lockTicketSyncState(tx, [normalized.incident]);
    const existing = await tx.ingestion_quarantine.findFirst({ where: { sourceTable: source, sourceHash: hash } });
    if (existing) return false;
    await tx.ingestion_quarantine.create({ data: {
      sourceTable: source, batchId, sourceHash: hash,
      reason: `row_write_rejected: ${String(error)}`.slice(0, 255),
      rawPayload: JSON.parse(JSON.stringify(row)),
    } });
    return true;
  });
  if (inserted) await incrIngestionQuarantine(1).catch(error => logger.warn('Quarantine gauge update failed', { error: String(error) }));
}
