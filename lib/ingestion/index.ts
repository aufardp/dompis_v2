import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import {
  getTableNames,
  fetchTableRows,
  fetchTableCount,
  fetchTableRowsByCursor,
  getExternalCursorDefinition,
  testExternalConnection,
  type ExternalCursorDefinition,
} from '../external-db/connection';
import {
  ExternalRow,
  NormalizedExternalRow,
  SyncResult,
} from '../external-db/types';
import {
  normalizeExternalRow,
  resolveIdentityStrict,
  computeSourceHash,
  normalizeStatus,
} from './normalizer';
import { resolveConflict } from './conflict-resolver';
import {
  emitIngestionCompleteEvent,
  emitIngestionFailedEvent,
  createBulkOutboxEvents,
  IngestionEventTypes,
} from './outbox-emitter';
import { setSyncStatus } from '@/lib/sync-metrics/metrics';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';

const DEFAULT_CHUNK_SIZE = parsePositiveIntEnv('INGESTION_CHUNK_SIZE', 1000);
const DEFAULT_BATCH_SIZE = parsePositiveIntEnv('INGESTION_BATCH_SIZE', 500);
const DEFAULT_CONCURRENCY = parsePositiveIntEnv('INGESTION_CONCURRENCY', 1);
const DEFAULT_RETRY_MAX = parsePositiveIntEnv(
  'INGESTION_RETRY_MAX',
  parsePositiveIntEnv('INGESTION_MAX_RETRIES', 3),
);
const DEFAULT_RETRY_BASE_MS = parsePositiveIntEnv('INGESTION_RETRY_BASE_MS', 250);

const TRANSIENT_ERROR_PATTERNS = [
  'deadlock',
  'lock wait timeout',
  'timeout',
  'timed out',
  'connection',
  'connection reset',
  'pool timeout',
  'etimedout',
  'econnreset',
  'econnrefused',
  'p1001',
  'p1002',
  'p1008',
  'p1017',
  'p2024',
  'p2034',
];

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

const TICKET_RAW_BULK_COLUMNS = [
  'incident',
  'sourceTable',
  'sourceHash',
  'lastSeenAt',
  'syncBatchId',
  'syncVersion',
  'isActive',
  'importedAt',
  'rawPayload',
  'status',
  'sourceUpdatedAt',
  'sync_date',
  'synced_at',
  'import_batch',
  ...FIELDS_TO_MAP.filter((field) => field !== 'incident'),
] as const;

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
  street_address: 500,
};

type IngestionMode = 'initial' | 'incremental' | 'recovery' | 'force_resync';

interface ChunkResult {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  quarantined: number;
  retried: number;
  errors: Array<{ incident: string; error: string }>;
}

interface TableCheckpoint {
  tableName: string;
  cursorStrategy: string;
  idColumn: string | null;
  modifiedColumn: string | null;
  lastCursorId: string | null;
  lastModifiedAt: Date | null;
}

interface BatchCursor {
  lastCursorId: string | null;
  lastModifiedAt: Date | null;
}

interface ProcessableRow {
  row: NormalizedExternalRow;
  identity: string;
  sourceHash: string;
  normalizedStatus: string;
}

type TicketRawBulkColumn = (typeof TICKET_RAW_BULK_COLUMNS)[number];

type TicketRawBulkRow = Partial<Record<TicketRawBulkColumn, unknown>>;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Ingestion aborted');
}

function isTransientError(error: unknown): boolean {
  const text = [
    error instanceof Error ? error.message : String(error),
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '',
  ]
    .join(' ')
    .toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Ingestion aborted'));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new Error('Ingestion aborted'));
      },
      { once: true },
    );
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retryMax: number; signal?: AbortSignal; onRetry: () => void },
): Promise<T> {
  let attempt = 0;
  while (attempt <= options.retryMax) {
    assertNotAborted(options.signal);
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.retryMax || !isTransientError(error)) throw error;
      attempt++;
      options.onRetry();
      const jitter = Math.floor(Math.random() * DEFAULT_RETRY_BASE_MS);
      await delay(DEFAULT_RETRY_BASE_MS * 2 ** (attempt - 1) + jitter, options.signal);
    }
  }
  throw new Error('Retry exhausted');
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        if (item) await worker(item);
      }
    },
  );
  await Promise.all(workers);
}

function parseExternalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRowCursor(
  rawRow: Record<string, unknown>,
  cursor: ExternalCursorDefinition,
): BatchCursor {
  return {
    lastCursorId: cursor.idColumn
      ? rawRow[cursor.idColumn] === null || rawRow[cursor.idColumn] === undefined
        ? null
        : String(rawRow[cursor.idColumn])
      : null,
    lastModifiedAt: cursor.modifiedColumn
      ? parseExternalDate(rawRow[cursor.modifiedColumn])
      : null,
  };
}

function normalizeModifiedCheckpoint(cursor: ExternalCursorDefinition, value: Date | null): Date | null {
  if (!value) return null;
  if (cursor.idColumn) return value;
  return new Date(value.getTime() - 1000);
}

async function getOrCreateCheckpoint(
  tableName: string,
  cursor: ExternalCursorDefinition,
): Promise<TableCheckpoint> {
  const row = await prisma.ingestion_checkpoint.upsert({
    where: { tableName },
    create: {
      tableName,
      cursorStrategy: cursor.strategy,
      idColumn: cursor.idColumn,
      modifiedColumn: cursor.modifiedColumn,
      status: 'idle',
    },
    update: {
      cursorStrategy: cursor.strategy,
      idColumn: cursor.idColumn,
      modifiedColumn: cursor.modifiedColumn,
    },
    select: {
      tableName: true,
      cursorStrategy: true,
      idColumn: true,
      modifiedColumn: true,
      lastCursorId: true,
      lastModifiedAt: true,
    },
  });
  return row;
}

function buildRawData(
  row: NormalizedExternalRow,
  sourceHash: string,
  now: Date,
  batchId: string,
  version: number,
  sourceTable: string,
  incidentIdentity: string,
): Prisma.ticket_rawUncheckedCreateInput {
  const sourceUpdatedAt = parseExternalDate(row.date_modified) ?? now;
  const data: Record<string, unknown> = {
    incident: incidentIdentity,
    sourceTable,
    sourceHash,
    lastSeenAt: now,
    syncBatchId: batchId,
    syncVersion: version,
    isActive: true,
    importedAt: now,
    rawPayload: row._rawPayload as Prisma.InputJsonValue,
    status: normalizeStatus(row.status),
    sourceUpdatedAt,
    sync_date: todayWibDateForDb(),
    synced_at: now,
    import_batch: batchId,
  };

  for (const field of FIELDS_TO_MAP) {
    const value = row[field];
    if (value !== null && value !== undefined) {
      const str = value instanceof Date ? value.toISOString() : String(value);
      const maxLen = COLUMN_MAX_LENGTH[field];
      data[field] = maxLen && str.length > maxLen ? str.slice(0, maxLen) : str;
    }
  }
  return data as Prisma.ticket_rawUncheckedCreateInput;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sqlIdentifier(identifier: string): Prisma.Sql {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return Prisma.raw(`\`${identifier}\``);
}

function toSqlValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

async function bulkUpsertTicketRaw(
  tx: Prisma.TransactionClient,
  rows: TicketRawBulkRow[],
  updateColumns: readonly TicketRawBulkColumn[],
): Promise<void> {
  if (rows.length === 0) return;

  const insertColumns = TICKET_RAW_BULK_COLUMNS;
  const assignments = updateColumns
    .filter((column) => column !== 'incident')
    .map(
      (column) =>
        Prisma.sql`${sqlIdentifier(column)} = VALUES(${sqlIdentifier(column)})`,
    );

  if (assignments.length === 0) {
    throw new Error('bulkUpsertTicketRaw requires at least one update column');
  }

  for (const chunk of chunkArray(rows, DEFAULT_BATCH_SIZE)) {
    await tx.$executeRaw`
      INSERT INTO ${sqlIdentifier('ticket_raw')}
        (${Prisma.join(insertColumns.map((column) => sqlIdentifier(column)))})
      VALUES ${Prisma.join(
        chunk.map((row) =>
          Prisma.sql`(${Prisma.join(
            insertColumns.map((column) => toSqlValue(row[column])),
          )})`,
        ),
      )}
      ON DUPLICATE KEY UPDATE ${Prisma.join(assignments)}
    `;
  }
}

function buildEvent(
  eventType: (typeof IngestionEventTypes)[keyof typeof IngestionEventTypes],
  row: ProcessableRow,
  sourceTable: string,
  previousStatus: string | null,
  syncVersion: number,
  batchId: string,
) {
  return {
    eventType,
    payload: {
      sourceTable,
      incident: row.row.incident || row.identity,
      identity: row.identity,
      previousStatus,
      newStatus: row.normalizedStatus,
      syncVersion,
      syncBatchId: batchId,
    },
  };
}

async function processBatch(
  rows: NormalizedExternalRow[],
  rawRows: Record<string, unknown>[],
  sourceTable: string,
  batchId: string,
  batchCursor: BatchCursor,
  cursor: ExternalCursorDefinition,
  tableResult: ChunkResult,
  signal?: AbortSignal,
): Promise<ChunkResult> {
  assertNotAborted(signal);
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    retried: 0,
    errors: [],
  };
  const now = nowWib();
  const processable: ProcessableRow[] = [];
  const quarantined: Array<{
    sourceTable: string;
    batchId: string;
    reason: string;
    rawPayload: Prisma.InputJsonValue;
    sourceHash?: string | null;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const identity = resolveIdentityStrict(row);
      const sourceHash = computeSourceHash(row);
      if (!identity.valid || !identity.primaryIdentity) {
        quarantined.push({
          sourceTable,
          batchId,
          reason: identity.reason ?? 'invalid identity',
          rawPayload: (rawRows[i] ?? row._rawPayload) as Prisma.InputJsonValue,
          sourceHash,
        });
        result.quarantined++;
        result.processed++;
        continue;
      }
      const sourceUpdatedAt = parseExternalDate(row.date_modified);
      if (row.date_modified && !sourceUpdatedAt) {
        quarantined.push({
          sourceTable,
          batchId,
          reason: `invalid date_modified: ${row.date_modified}`,
          rawPayload: (rawRows[i] ?? row._rawPayload) as Prisma.InputJsonValue,
          sourceHash,
        });
        result.quarantined++;
        result.processed++;
        continue;
      }
      processable.push({
        row,
        identity: identity.primaryIdentity,
        sourceHash,
        normalizedStatus: normalizeStatus(row.status),
      });
    } catch (error) {
      quarantined.push({
        sourceTable,
        batchId,
        reason: `normalization failed: ${String(error)}`.slice(0, 255),
        rawPayload: (rawRows[i] ?? row._rawPayload) as Prisma.InputJsonValue,
      });
      result.quarantined++;
      result.processed++;
    }
  }

  const identities = processable.map((item) => item.identity);
  const existingRows = identities.length
    ? await prisma.ticket_raw.findMany({
        where: { incident: { in: identities } },
        select: {
          incident: true,
          sourceHash: true,
          status: true,
          syncVersion: true,
        },
      })
    : [];
  const existingMap = new Map(existingRows.map((row) => [row.incident, row]));
  const events: Array<Parameters<typeof createBulkOutboxEvents>[1][number]> = [];
  const changedRows: TicketRawBulkRow[] = [];
  const heartbeatRows: TicketRawBulkRow[] = [];

  for (const item of processable) {
    const existing = existingMap.get(item.identity);
    const conflict = resolveConflict(
      existing
        ? {
            sourceHash: existing.sourceHash,
            status: existing.status,
            syncVersion: existing.syncVersion,
          }
        : null,
      item.sourceHash,
      item.normalizedStatus,
    );
    const data = buildRawData(
      item.row,
      item.sourceHash,
      now,
      batchId,
      conflict.newVersion,
      sourceTable,
      item.identity,
    );

    if (!existing) {
      changedRows.push(data as TicketRawBulkRow);
      events.push(
        buildEvent(
          IngestionEventTypes.TICKET_RAW_CREATED,
          item,
          sourceTable,
          null,
          conflict.newVersion,
          batchId,
        ),
      );
      result.inserted++;
    } else if (conflict.shouldUpdate) {
      changedRows.push(data as TicketRawBulkRow);
      events.push(
        buildEvent(
          existing.status !== conflict.newStatus
            ? IngestionEventTypes.TICKET_RAW_STATUS_CHANGED
            : IngestionEventTypes.TICKET_RAW_UPDATED,
          item,
          sourceTable,
          existing.status,
          conflict.newVersion,
          batchId,
        ),
      );
      result.updated++;
    } else {
      heartbeatRows.push(data as TicketRawBulkRow);
      result.skipped++;
    }
    result.processed++;
  }

  await prisma.$transaction(
    async (tx) => {
      assertNotAborted(signal);
      await bulkUpsertTicketRaw(tx, changedRows, TICKET_RAW_BULK_COLUMNS);
      await bulkUpsertTicketRaw(tx, heartbeatRows, [
        'lastSeenAt',
        'syncBatchId',
        'importedAt',
        'isActive',
      ]);
      if (quarantined.length > 0) {
        await tx.ingestion_quarantine.createMany({ data: quarantined });
      }
      await createBulkOutboxEvents(tx, events);
      await tx.ingestion_checkpoint.update({
        where: { tableName: sourceTable },
        data: {
          lastCursorId: batchCursor.lastCursorId,
          lastModifiedAt: normalizeModifiedCheckpoint(
            cursor,
            batchCursor.lastModifiedAt,
          ),
          lastSuccessfulBatchId: batchId,
          status: 'running',
          processedCount: tableResult.processed + result.processed,
          insertedCount: tableResult.inserted + result.inserted,
          updatedCount: tableResult.updated + result.updated,
          skippedCount: tableResult.skipped + result.skipped,
          failedCount: tableResult.failed + result.failed,
          quarantinedCount: tableResult.quarantined + result.quarantined,
          retriedCount: tableResult.retried + result.retried,
          errorMessage: null,
        },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 60_000 },
  );

  assertNotAborted(signal);
  return result;
}

async function processTable(
  tableName: string,
  batchId: string,
  mode: IngestionMode,
  signal?: AbortSignal,
): Promise<ChunkResult> {
  const startedAt = nowWib();
  const startMs = Date.now();
  const cursor = await getExternalCursorDefinition(tableName);
  const persisted = await getOrCreateCheckpoint(tableName, cursor);
  const totalRows = await fetchTableCount(tableName);
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    retried: 0,
    errors: [],
  };

  await prisma.ingestion_checkpoint.update({
    where: { tableName },
    data: {
      cursorStrategy: cursor.strategy,
      idColumn: cursor.idColumn,
      modifiedColumn: cursor.modifiedColumn,
      status: 'running',
      lastStartedAt: startedAt,
      errorMessage: null,
      ...(mode === 'initial' || mode === 'force_resync'
        ? { lastCursorId: null, lastModifiedAt: null }
        : {}),
    },
  });

  const runLog = await prisma.ingestion_run_log.create({
    data: {
      batchId,
      tableName,
      mode,
      status: 'running',
      cursorStrategy: cursor.strategy,
      startedAt,
    },
  });

  let activeCursor: BatchCursor =
    mode === 'initial' || mode === 'force_resync' || cursor.strategy === 'id'
      ? { lastCursorId: null, lastModifiedAt: null }
      : {
          lastCursorId: persisted.lastCursorId,
          lastModifiedAt: persisted.lastModifiedAt,
        };
  let hasMore = true;
  let snapshotOffset = 0;
  const usesSnapshotScan =
    cursor.strategy === 'snapshot' || cursor.strategy === 'id';

  try {
    while (hasMore) {
      assertNotAborted(signal);
      const rawRows = await withRetry(
        () =>
          usesSnapshotScan
            ? fetchTableRows(tableName, {
                limit: DEFAULT_CHUNK_SIZE,
                offset: snapshotOffset,
                orderBy: cursor.idColumn ?? cursor.columns[0]?.name ?? 'id',
              })
            : fetchTableRowsByCursor(tableName, {
                limit: DEFAULT_CHUNK_SIZE,
                idColumn: cursor.idColumn,
                modifiedColumn: cursor.modifiedColumn,
                lastCursorId: activeCursor.lastCursorId,
                lastModifiedAt: activeCursor.lastModifiedAt,
              }),
        {
          retryMax: DEFAULT_RETRY_MAX,
          signal,
          onRetry: () => {
            result.retried++;
          },
        },
      );

      if (rawRows.length === 0) break;
      const normalizedRows = rawRows.map((row) =>
        normalizeExternalRow(row as unknown as ExternalRow, tableName),
      );
      const lastRaw = rawRows[rawRows.length - 1] as Record<string, unknown>;
      const nextCursor = getRowCursor(lastRaw, cursor);
      const chunkResult = await withRetry(
        () =>
          processBatch(
            normalizedRows,
            rawRows as unknown as Record<string, unknown>[],
            tableName,
            batchId,
            nextCursor,
            cursor,
            result,
            signal,
          ),
        {
          retryMax: DEFAULT_RETRY_MAX,
          signal,
          onRetry: () => {
            result.retried++;
          },
        },
      );

      result.processed += chunkResult.processed;
      result.inserted += chunkResult.inserted;
      result.updated += chunkResult.updated;
      result.skipped += chunkResult.skipped;
      result.failed += chunkResult.failed;
      result.quarantined += chunkResult.quarantined;
      result.errors.push(...chunkResult.errors);
      activeCursor = {
        lastCursorId: nextCursor.lastCursorId,
        lastModifiedAt: normalizeModifiedCheckpoint(cursor, nextCursor.lastModifiedAt),
      };
      if (usesSnapshotScan) {
        activeCursor = { lastCursorId: null, lastModifiedAt: null };
        snapshotOffset += rawRows.length;
      }
      hasMore = rawRows.length === DEFAULT_CHUNK_SIZE;
      console.log(
        `[Ingestion] ${tableName} ${mode} processed=${result.processed}/${totalRows} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped} quarantined=${result.quarantined}`,
      );
    }

    await prisma.ingestion_checkpoint.update({
      where: { tableName },
      data: {
        status: 'success',
        lastFinishedAt: nowWib(),
        processedCount: result.processed,
        insertedCount: result.inserted,
        updatedCount: result.updated,
        skippedCount: result.skipped,
        failedCount: result.failed,
        quarantinedCount: result.quarantined,
        retriedCount: result.retried,
        errorMessage: null,
      },
    });
    await prisma.ingestion_run_log.update({
      where: { id: runLog.id },
      data: {
        status: 'success',
        lastCursorId: activeCursor.lastCursorId,
        lastModifiedAt: activeCursor.lastModifiedAt,
        processed: result.processed,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        quarantined: result.quarantined,
        retried: result.retried,
        durationMs: Date.now() - startMs,
        finishedAt: nowWib(),
      },
    });
    return result;
  } catch (error) {
    const message = String(error);
    result.failed++;
    result.errors.push({ incident: 'table', error: message });
    await prisma.ingestion_checkpoint.update({
      where: { tableName },
      data: {
        status: message.includes('Ingestion aborted') ? 'aborted' : 'failed',
        failedCount: result.failed,
        errorMessage: message,
        lastFinishedAt: nowWib(),
      },
    });
    await prisma.ingestion_run_log.update({
      where: { id: runLog.id },
      data: {
        status: message.includes('Ingestion aborted') ? 'aborted' : 'failed',
        processed: result.processed,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        quarantined: result.quarantined,
        retried: result.retried,
        durationMs: Date.now() - startMs,
        errorMessage: message,
        finishedAt: nowWib(),
      },
    });
    throw error;
  }
}

async function runIngestionMode(
  mode: IngestionMode,
  signal?: AbortSignal,
): Promise<SyncResult> {
  await setSyncStatus('running', {});
  const start = Date.now();
  const batchId = `ingest-${Date.now()}`;
  const result: SyncResult = {
    syncBatchId: batchId,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    retried: 0,
    errors: [],
  };

  if (process.env.INGESTION_ENABLED !== 'true') {
    await setSyncStatus('success', { duration: Date.now() - start, batchId });
    return result;
  }

  if (!(await testExternalConnection())) {
    await setSyncStatus('failed', { duration: Date.now() - start, batchId });
    throw new Error('External DB not connected');
  }

  const tableNames = getTableNames();
  if (tableNames.length === 0) {
    await setSyncStatus('success', { duration: Date.now() - start, batchId });
    return result;
  }

  try {
    await runLimited(tableNames, DEFAULT_CONCURRENCY, async (tableName) => {
      assertNotAborted(signal);
      try {
        const tableResult = await processTable(tableName, batchId, mode, signal);
        result.processed = (result.processed ?? 0) + tableResult.processed;
        result.inserted += tableResult.inserted;
        result.updated += tableResult.updated;
        result.skipped += tableResult.skipped;
        result.failed += tableResult.failed;
        result.quarantined = (result.quarantined ?? 0) + tableResult.quarantined;
        result.retried = (result.retried ?? 0) + tableResult.retried;
        result.errors.push(
          ...tableResult.errors.map((error) => ({ table: tableName, ...error })),
        );
      } catch (error) {
        const message = String(error);
        result.failed++;
        result.errors.push({ table: tableName, incident: 'table', error: message });
        await emitIngestionFailedEvent(batchId, tableName, message);
        throw error;
      }
    });

    const duration = Date.now() - start;
    await emitIngestionCompleteEvent({
      syncBatchId: batchId,
      tableName: 'all',
      totalProcessed: result.processed ?? 0,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      duration,
    });
    await setSyncStatus(result.failed > 0 ? 'failed' : 'success', {
      duration,
      processed: result.processed ?? 0,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      quarantined: result.quarantined ?? 0,
      retried: result.retried ?? 0,
      tableName: 'all',
      batchId,
    });
    if (result.failed > 0) {
      throw new Error(`Ingestion completed with ${result.failed} failure(s)`);
    }
    return result;
  } catch (error) {
    await setSyncStatus('failed', {
      duration: Date.now() - start,
      processed: result.processed ?? 0,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      quarantined: result.quarantined ?? 0,
      retried: result.retried ?? 0,
      tableName: 'all',
      batchId,
    });
    throw error;
  }
}

export async function runIngestion(signal?: AbortSignal): Promise<SyncResult> {
  return runIngestionMode('incremental', signal);
}

export async function runInitialLoad(signal?: AbortSignal): Promise<SyncResult> {
  console.log('[Ingestion] Starting initial full load...');
  return runIngestionMode('initial', signal);
}

export async function runIncrementalSync(signal?: AbortSignal): Promise<SyncResult> {
  console.log('[Ingestion] Starting incremental sync...');
  return runIngestionMode('incremental', signal);
}

export async function runRecoveryIngestion(signal?: AbortSignal): Promise<SyncResult> {
  console.log('[Ingestion] Starting recovery from checkpoints...');
  return runIngestionMode('recovery', signal);
}

export async function runForceResync(signal?: AbortSignal): Promise<SyncResult> {
  console.log('[Ingestion] Starting force resync without deleting data...');
  return runIngestionMode('force_resync', signal);
}

export async function getIngestionReconciliationReport(): Promise<{
  tables: Array<{
    tableName: string;
    externalCount: number;
    importedCount: number;
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    quarantined: number;
    retried: number;
    cursorStrategy: string | null;
    lastCursorId: string | null;
    lastModifiedAt: Date | null;
    lastSuccessfulRun: Date | null;
    status: string | null;
  }>;
}> {
  const tableNames = getTableNames();
  const checkpoints = await prisma.ingestion_checkpoint.findMany({
    where: { tableName: { in: tableNames } },
  });
  const checkpointMap = new Map(checkpoints.map((row) => [row.tableName, row]));
  const tables = [];

  for (const tableName of tableNames) {
    const checkpoint = checkpointMap.get(tableName);
    const [externalCount, importedCount, quarantined] = await Promise.all([
      fetchTableCount(tableName).catch(() => -1),
      prisma.ticket_raw.count({ where: { sourceTable: tableName } }),
      prisma.ingestion_quarantine.count({ where: { sourceTable: tableName } }),
    ]);
    tables.push({
      tableName,
      externalCount,
      importedCount,
      inserted: checkpoint?.insertedCount ?? 0,
      updated: checkpoint?.updatedCount ?? 0,
      skipped: checkpoint?.skippedCount ?? 0,
      failed: checkpoint?.failedCount ?? 0,
      quarantined,
      retried: checkpoint?.retriedCount ?? 0,
      cursorStrategy: checkpoint?.cursorStrategy ?? null,
      lastCursorId: checkpoint?.lastCursorId ?? null,
      lastModifiedAt: checkpoint?.lastModifiedAt ?? null,
      lastSuccessfulRun: checkpoint?.lastFinishedAt ?? null,
      status: checkpoint?.status ?? null,
    });
  }

  return { tables };
}
