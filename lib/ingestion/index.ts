import { prisma } from '@/app/libs/prisma';
import {
  getExternalPool,
  getTableNames,
  fetchTableRowsAfterId,
  fetchTableCount,
  testExternalConnection,
} from '../external-db/connection';
import {
  ExternalRow,
  NormalizedExternalRow,
  SyncResult,
} from '../external-db/types';
import {
  normalizeExternalRow,
  resolveIdentity,
  computeSourceHash,
  normalizeStatus,
} from './normalizer';
import { resolveConflict } from './conflict-resolver';
import {
  emitIngestionCompleteEvent,
  emitIngestionFailedEvent,
  emitBulkEvents,
  IngestionEventTypes,
} from './outbox-emitter';
import { setSyncStatus } from '@/lib/sync-metrics/metrics';
import { nowWib } from '@/lib/timezone';

const DEFAULT_CHUNK_SIZE = parseInt(
  process.env.INGESTION_CHUNK_SIZE || '1000',
  10,
);
const DEFAULT_BATCH_SIZE = parseInt(
  process.env.INGESTION_BATCH_SIZE || '500',
  10,
);

const FIELDS_TO_MAP: Array<keyof NormalizedExternalRow> = [
  'incident',
  'ttr_customer',
  'summary',
  'reported_date',
  'owner_group',
  'owner',
  'customer_segment',
  'service_type',
  'witel',
  'workzone',
  'status_date',
  'ticket_id_gamas',
  'reported_by',
  'contact_phone',
  'contact_name',
  'contact_email',
  'booking_date',
  'description_assignment',
  'reported_priority',
  'source_ticket',
  'subsidiary',
  'external_ticket_id',
  'channel',
  'customer_type',
  'closed_by',
  'closed_reopen_by',
  'customer_id',
  'customer_name',
  'service_id',
  'service_no',
  'slg',
  'technology',
  'lapul',
  'gaul',
  'onu_rx',
  'pending_reason',
  'date_modified',
  'incident_domain',
  'region',
  'symptom',
  'hierarchy_path',
  'solution',
  'description_actual_solution',
  'kode_produk',
  'perangkat',
  'technician',
  'device_name',
  'worklog_summary',
  'last_update_worklog',
  'classification_flag',
  'realm',
  'related_to_gamas',
  'tsc_result',
  'scc_result',
  'ttr_agent',
  'ttr_mitra',
  'ttr_nasional',
  'ttr_pending',
  'ttr_region',
  'ttr_witel',
  'ttr_end_to_end',
  'note',
  'guarantee_status',
  'resolve_date',
  'sn_ont',
  'tipe_ont',
  'manufacture_ont',
  'impacted_site',
  'cause',
  'resolution',
  'notes_eskalasi',
  'rk_information',
  'external_ticket_tier_3',
  'customer_category',
  'classification_path',
  'teritory_near_end',
  'teritory_far_end',
  'urgency',
  'urgency_description',
  'street_address',
];

const COLUMN_MAX_LENGTH: Record<string, number> = {
  onu_rx: 10,
  lapul: 10,
  gaul: 10,
  workzone: 10,
  technology: 50,
  urgency: 20,
  ttr_agent: 20,
  ttr_mitra: 20,
  ttr_nasional: 20,
  ttr_pending: 20,
  ttr_region: 20,
  ttr_witel: 20,
  ttr_end_to_end: 20,
  customer_segment: 20,
  channel: 20,
  classification_flag: 20,
  related_to_gamas: 10,
  sn_ont: 30,
  tipe_ont: 20,
  manufacture_ont: 20,
  impacted_site: 50,
  cause: 50,
  resolution: 50,
  service_type: 50,
  kode_produk: 50,
  slg: 50,
  region: 50,
  teritory_near_end: 50,
  teritory_far_end: 50,
  customer_category: 50,
  external_ticket_tier_3: 50,
  ttr_customer: 100,
  reported_date: 100,
  owner_group: 100,
  owner: 100,
  witel: 100,
  status_date: 100,
  ticket_id_gamas: 100,
  reported_by: 50,
  contact_phone: 50,
  contact_name: 100,
  booking_date: 50,
  description_assignment: 100,
  reported_priority: 100,
  source_ticket: 50,
  subsidiary: 100,
  external_ticket_id: 50,
  customer_type: 100,
  closed_by: 100,
  closed_reopen_by: 100,
  customer_id: 100,
  service_id: 100,
  service_no: 100,
  date_modified: 50,
  incident_domain: 100,
  hierarchy_path: 100,
  solution: 100,
  description_actual_solution: 100,
  perangkat: 100,
  device_name: 100,
  worklog_summary: 100,
  last_update_worklog: 100,
  realm: 100,
  tsc_result: 100,
  scc_result: 100,
  rk_information: 100,
  classification_path: 100,
  urgency_description: 100,
  technician: 255,
  customer_name: 255,
  contact_email: 255,
  note: 255,
  notes_eskalasi: 255,
};

interface ChunkResult {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ incident: string; error: string }>;
}

interface TicketRawEvent {
  sourceTable: string;
  incident: string;
  identity: string;
  previousStatus?: string | null;
  newStatus: string;
  syncVersion: number;
  syncBatchId: string;
}

async function fetchAndProcessTable(
  tableName: string,
  batchId: string,
  options: { chunkSize?: number; batchSize?: number } = {},
): Promise<ChunkResult> {
  const { chunkSize = DEFAULT_CHUNK_SIZE, batchSize = DEFAULT_BATCH_SIZE } =
    options;
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const externalPool = getExternalPool();
  if (!externalPool) throw new Error('External DB pool not available');

  console.log(`[Ingestion] Processing table: ${tableName}`);
  const totalRows = await fetchTableCount(tableName);
  console.log(`[Ingestion] Total rows in ${tableName}: ${totalRows}`);
  if (totalRows === 0) return result;

  let lastId: number | string | null = null;
  let seenRows = 0;
  let hasMore = true;
  while (hasMore) {
    const rows = await fetchTableRowsAfterId(tableName, {
      limit: chunkSize,
      lastId,
      orderBy: 'id',
    });
    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    const normalizedRows = rows.map((row) =>
      normalizeExternalRow(row as unknown as ExternalRow, tableName),
    );
    const chunkResult = await processChunk(
      normalizedRows,
      tableName,
      batchId,
      batchSize,
    );

    result.processed += chunkResult.processed;
    result.inserted += chunkResult.inserted;
    result.updated += chunkResult.updated;
    result.skipped += chunkResult.skipped;
    result.failed += chunkResult.failed;
    result.errors.push(...chunkResult.errors);
    seenRows += rows.length;
    const nextCursor = rows[rows.length - 1]?.id;
    if (nextCursor === undefined || nextCursor === null) {
      throw new Error(`Table ${tableName} does not expose a stable id cursor`);
    }
    lastId = nextCursor as number | string;
    hasMore = rows.length === chunkSize;
    console.log(
      `[Ingestion] ${tableName} progress: ${seenRows}/${totalRows} (${Math.min(100, (seenRows / totalRows) * 100).toFixed(1)}%)`,
    );
  }
  return result;
}

async function processChunk(
  rows: NormalizedExternalRow[],
  sourceTable: string,
  batchId: string,
  batchSize: number,
): Promise<ChunkResult> {
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const eventsToEmit: Array<{
    eventType: (typeof IngestionEventTypes)[keyof typeof IngestionEventTypes];
    payload: TicketRawEvent;
  }> = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      const batchResult = await processBatch(batch, sourceTable, batchId);
      result.processed += batchResult.processed;
      result.inserted += batchResult.inserted;
      result.updated += batchResult.updated;
      result.skipped += batchResult.skipped;
      result.failed += batchResult.failed;
      result.errors.push(...batchResult.errors);
      eventsToEmit.push(...batchResult.events);
    } catch (error) {
      console.error(
        `[Ingestion] Batch error (${sourceTable}, offset ${i}):`,
        error,
      );
      result.failed += batch.length;
      result.errors.push({
        incident: batch[0]?.incident || 'unknown',
        error: String(error),
      });
    }
  }

  if (eventsToEmit.length > 0) {
    try {
      await emitBulkEvents(eventsToEmit);
    } catch (error) {
      console.error('[Ingestion] Failed to emit events:', error);
    }
  }
  return result;
}

function buildRawData(
  row: NormalizedExternalRow,
  sourceHash: string,
  now: Date,
  batchId: string,
  version: number,
  sourceTable: string,
  incidentIdentity: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    incident: incidentIdentity,
    sourceTable,
    sourceHash,
    lastSeenAt: now,
    syncBatchId: batchId,
    syncVersion: version,
    isActive: true,
    importedAt: now,
    rawPayload: row._rawPayload,
    status: normalizeStatus(row.status),
    sourceUpdatedAt: row.date_modified
      ? new Date(String(row.date_modified))
      : now,
  };
  for (const field of FIELDS_TO_MAP) {
    const value = row[field];
    if (value !== null && value !== undefined) {
      const str = value instanceof Date ? value.toISOString() : String(value);
      const maxLen = COLUMN_MAX_LENGTH[field];
      data[field] = maxLen && str.length > maxLen ? str.slice(0, maxLen) : str;
    }
  }
  return data;
}

async function processBatch(
  rows: NormalizedExternalRow[],
  sourceTable: string,
  batchId: string,
): Promise<
  ChunkResult & {
    events: Array<{
      eventType: (typeof IngestionEventTypes)[keyof typeof IngestionEventTypes];
      payload: TicketRawEvent;
    }>;
  }
> {
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const events: Array<{
    eventType: (typeof IngestionEventTypes)[keyof typeof IngestionEventTypes];
    payload: TicketRawEvent;
  }> = [];
  const now = nowWib();

  const incidents = rows
    .map((r) => resolveIdentity(r).primaryIdentity)
    .filter(Boolean) as string[];

  const existingRecords = await prisma.ticket_raw.findMany({
    where: { incident: { in: incidents } },
    select: {
      id_ticket: true,
      incident: true,
      sourceHash: true,
      status: true,
      syncVersion: true,
    },
  });
  const existingMap = new Map(existingRecords.map((r) => [r.incident, r]));

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Array<{
    where: { incident: string };
    data: Record<string, unknown>;
  }> = [];

  for (const row of rows) {
    try {
      const identity = resolveIdentity(row);
      const sourceHash = computeSourceHash(row);
      const normalizedStatus = normalizeStatus(row.status);
      const existing = existingMap.get(identity.primaryIdentity);

      const conflict = resolveConflict(
        existing
          ? {
              sourceHash: existing.sourceHash,
              status: existing.status,
              syncVersion: existing.syncVersion,
            }
          : null,
        sourceHash,
        normalizedStatus,
      );

      if (!conflict.shouldInsert && !conflict.shouldUpdate) {
        result.skipped++;
        result.processed++;
        continue;
      }

      const data = buildRawData(
        row,
        sourceHash,
        now,
        batchId,
        conflict.newVersion,
        sourceTable,
        identity.primaryIdentity,
      );

      if (conflict.shouldInsert) {
        toInsert.push(data);
        events.push({
          eventType: IngestionEventTypes.TICKET_RAW_CREATED,
          payload: {
            sourceTable,
            incident: row.incident || identity.primaryIdentity,
            identity: identity.primaryIdentity,
            previousStatus: null,
            newStatus: conflict.newStatus,
            syncVersion: conflict.newVersion,
            syncBatchId: batchId,
          },
        });
      } else if (conflict.shouldUpdate && existing) {
        toUpdate.push({ where: { incident: existing.incident! }, data });
        const prevStatus = existing.status;
        events.push({
          eventType:
            prevStatus !== conflict.newStatus
              ? IngestionEventTypes.TICKET_RAW_STATUS_CHANGED
              : IngestionEventTypes.TICKET_RAW_UPDATED,
          payload: {
            sourceTable,
            incident: row.incident || identity.primaryIdentity,
            identity: identity.primaryIdentity,
            previousStatus: prevStatus,
            newStatus: conflict.newStatus,
            syncVersion: conflict.newVersion,
            syncBatchId: batchId,
          },
        });
      }
      result.processed++;
    } catch (error) {
      console.error('[Ingestion] Error processing row:', error);
      result.failed++;
      result.errors.push({
        incident: row.incident || 'unknown',
        error: String(error),
      });
    }
  }

  if (toInsert.length > 0) {
    const createResult = await prisma.ticket_raw.createMany({
      data: toInsert as any,
      skipDuplicates: true,
    });
    result.inserted += createResult.count;
    const skippedDuplicates = toInsert.length - createResult.count;
    if (skippedDuplicates > 0) {
      result.skipped += skippedDuplicates;
    }
  }

  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((u) =>
        prisma.ticket_raw.update({
          where: u.where,
          data: u.data as Parameters<
            typeof prisma.ticket_raw.update
          >[0]['data'],
        }),
      ),
      { isolationLevel: 'ReadCommitted' },
    );
    result.updated += toUpdate.length;
  }

  return { ...result, events };
}

export async function runIngestion(signal?: AbortSignal): Promise<SyncResult> {
  await setSyncStatus('running', {});
  const start = Date.now();
  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (process.env.INGESTION_ENABLED !== 'true') {
    console.log('[Ingestion] Disabled');
    await setSyncStatus('success', { duration: Date.now() - start });
    return result;
  }

  if (!(await testExternalConnection())) {
    console.error('[Ingestion] External DB not connected');
    await setSyncStatus('failed', { duration: Date.now() - start });
    return result;
  }

  const tableNames = getTableNames();
  if (tableNames.length === 0) {
    console.warn('[Ingestion] No tables configured');
    await setSyncStatus('success', { duration: Date.now() - start });
    return result;
  }

  const batchId = `ingest-${Date.now()}`;
  result.syncBatchId = batchId;
  console.log(`[Ingestion] Starting batch: ${batchId}`);

  try {
    for (const tableName of tableNames) {
      if (signal?.aborted) {
        console.log('[Ingestion] Aborted');
        break;
      }
      try {
        const tableResult = await fetchAndProcessTable(tableName, batchId);
        result.inserted += tableResult.inserted;
        result.updated += tableResult.updated;
        result.skipped += tableResult.skipped;
        result.failed += tableResult.failed;
        result.errors.push(
          ...tableResult.errors.map((e) => ({ table: tableName, ...e })),
        );
      } catch (error) {
        console.error(`[Ingestion] Failed table ${tableName}:`, error);
        result.failed++;
        result.errors.push({
          table: tableName,
          incident: 'table',
          error: String(error),
        });
        await emitIngestionFailedEvent(batchId, tableName, String(error));
      }
    }

    const duration = Date.now() - start;
    console.log(
      `[Ingestion] Complete: ${batchId} | inserted: ${result.inserted} | updated: ${result.updated} | skipped: ${result.skipped} | failed: ${result.failed} | ${duration}ms`,
    );

    await emitIngestionCompleteEvent({
      syncBatchId: batchId,
      tableName: 'all',
      totalProcessed:
        result.inserted + result.updated + result.skipped + result.failed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      duration,
    });

    if (result.failed > 0) {
      await setSyncStatus('failed', {
        duration,
        processed:
          result.inserted + result.updated + result.skipped + result.failed,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      });
      throw new Error(
        `Ingestion completed with ${result.failed} failed record(s) or table(s)`,
      );
    }

    await setSyncStatus('success', {
      duration,
      processed:
        result.inserted + result.updated + result.skipped + result.failed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (err) {
    await setSyncStatus('failed', { duration: Date.now() - start });
    throw err;
  }

  return result;
}

export async function runInitialLoad(
  signal?: AbortSignal,
): Promise<SyncResult> {
  console.log('[Ingestion] Starting initial full load...');
  return runIngestion(signal);
}

export async function runIncrementalSync(
  signal?: AbortSignal,
): Promise<SyncResult> {
  console.log('[Ingestion] Starting incremental sync...');
  return runIngestion(signal);
}
