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
  validateExternalRow,
} from './normalizer';
import { resolveConflict } from './conflict-resolver';
import {
  emitIngestionCompleteEvent,
  emitIngestionFailedEvent,
  createBulkOutboxEvents,
  IngestionEventTypes,
} from './outbox-emitter';
import { recordSyncMetric, setSyncStatus } from '@/lib/sync-metrics/metrics';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import { logger } from '@/lib/observability/logger';
import { isRedisReady, redis } from '@/lib/redis';
import { PROJECTION_REQUEST_CHANNEL } from '@/lib/worker-signals';
import { setMySQLSessionTimeout } from '@/lib/workers/task-runner';
import { isQosmicBridgeConfigured } from '@/lib/external-db/qosmic-bridge/client';
import { broadcastBridgeFreshness } from '@/app/libs/sseBroadcast';
import {
  iterateNossaOpen,
  iterateNossaClosedIncremental,
  iterateNossaClosedBackfill,
} from '@/lib/external-db/qosmic-bridge/nossa';

const DEFAULT_CHUNK_SIZE = parsePositiveIntEnv('INGESTION_CHUNK_SIZE', 1000);
const DEFAULT_BATCH_SIZE = parsePositiveIntEnv('INGESTION_BATCH_SIZE', 500);
const DEFAULT_WRITE_CHUNK_SIZE = parsePositiveIntEnv(
  'INGESTION_WRITE_CHUNK_SIZE',
  Math.min(DEFAULT_CHUNK_SIZE, 1000),
);
const DEFAULT_CONCURRENCY = parsePositiveIntEnv('INGESTION_CONCURRENCY', 1);
const DEFAULT_RETRY_MAX = parsePositiveIntEnv(
  'INGESTION_RETRY_MAX',
  parsePositiveIntEnv('INGESTION_MAX_RETRIES', 3),
);
const DEFAULT_RETRY_BASE_MS = parsePositiveIntEnv('INGESTION_RETRY_BASE_MS', 250);
const DEFAULT_TRANSACTION_TIMEOUT_MS = parsePositiveIntEnv(
  'INGESTION_TRANSACTION_TIMEOUT_MS',
  120_000,
);
const MYSQL_MAX_PREPARED_STATEMENT_PLACEHOLDERS = 65_535;
const MYSQL_PLACEHOLDER_SAFETY_MARGIN = 5_000;

// Adaptive backoff: turunkan chunk size otomatis saat timeout
let adaptiveWriteChunkSize = DEFAULT_WRITE_CHUNK_SIZE;
const MIN_WRITE_CHUNK_SIZE = 10;

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

export interface ChunkResult {
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

type CursorScanMode = 'cursor' | 'snapshot';

interface ProcessableRow {
  row: NormalizedExternalRow;
  identity: string;
  sourceHash: string;
  normalizedStatus: string;
  sourceUpdatedAt: Date | null;
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

function classifyTransientError(error: unknown): string {
  const text = [
    error instanceof Error ? error.message : String(error),
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '',
  ]
    .join(' ')
    .toLowerCase();

  if (text.includes('deadlock') || text.includes('1213')) return 'deadlock';
  if (text.includes('lock wait timeout')) return 'lock_wait_timeout';
  if (text.includes('p2024') || text.includes('pool timeout')) return 'pool_timeout';
  if (text.includes('p1017') || text.includes('connection')) return 'connection';
  if (text.includes('timeout') || text.includes('timed out')) return 'timeout';
  return 'transient';
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
  options: {
    retryMax: number;
    signal?: AbortSignal;
    context?: Record<string, unknown>;
    label?: string;
    onRetry?: (details: {
      attempt: number;
      delayMs: number;
      error: unknown;
      errorType: string;
    }) => void;
  },
): Promise<T> {
  let attempt = 0;
  while (attempt <= options.retryMax) {
    assertNotAborted(options.signal);
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.retryMax || !isTransientError(error)) throw error;
      attempt++;
      const jitter = Math.floor(Math.random() * DEFAULT_RETRY_BASE_MS);
      const delayMs = DEFAULT_RETRY_BASE_MS * 2 ** (attempt - 1) + jitter;
      const errorType = classifyTransientError(error);
      logger.warn('Retrying transient ingestion operation', {
        component: 'ingestion',
        label: options.label ?? 'unknown',
        attempt,
        retryMax: options.retryMax,
        delayMs,
        errorType,
        ...(options.context ?? {}),
      });
      options.onRetry?.({ attempt, delayMs, error, errorType });
      await delay(delayMs, options.signal);
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
  const results = await Promise.allSettled(workers);
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  for (const r of rejected) {
    logger.warn('[Ingestion] Worker rejected:', { error: String(r.reason) });
  }
}

const PROJECTION_DEBOUNCE_KEY = 'projection:debounce';
const PROJECTION_DEBOUNCE_SECONDS = 30;

async function requestProjectionRefresh(syncBatchId?: string | null): Promise<void> {
  if (process.env.INGESTION_TRIGGER_PROJECTION === 'false') return;
  if (!isRedisReady()) return;

  // Debounce: hanya publish sekali setiap 30 detik untuk mengurangi flood
  // ke projection worker. Ingestion per-page bisa trigger berkali-kali.
  try {
    const setResult = await redis.set(
      PROJECTION_DEBOUNCE_KEY,
      Date.now().toString(),
      'EX',
      PROJECTION_DEBOUNCE_SECONDS,
      'NX',
    );
    if (setResult !== 'OK') {
      return; // masih dalam window debounce, skip
    }
  } catch {
    // Redis error — tetap lanjut publish (fail-open)
  }

  try {
    await redis.publish(
      PROJECTION_REQUEST_CHANNEL,
      JSON.stringify({
        source: 'ingestion',
        syncBatchId,
        requestedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    logger.warn('[Ingestion] Failed to request projection refresh:', {
      syncBatchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

function resolveCursorScanMode(cursor: ExternalCursorDefinition): CursorScanMode {
  return cursor.strategy === 'snapshot' ? 'snapshot' : 'cursor';
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

export function buildRawData(
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
    // Keep ticket_raw.status aligned with the external source column as-is.
    // Canonical status normalization is still handled separately for ticket projection.
    status: row.status ? String(row.status).trim() : null,
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

function sortTicketRawRowsByIncident(rows: TicketRawBulkRow[]): TicketRawBulkRow[] {
  return [...rows].sort((a, b) =>
    String(a.incident ?? '').localeCompare(String(b.incident ?? '')),
  );
}

async function bulkUpsertTicketRaw(
  tx: Prisma.TransactionClient,
  rows: TicketRawBulkRow[],
  updateColumns: readonly TicketRawBulkColumn[],
): Promise<void> {
  if (rows.length === 0) return;

  const insertColumns = TICKET_RAW_BULK_COLUMNS;
  const maxRowsByPlaceholderLimit = Math.max(
    1,
    Math.floor(
      (MYSQL_MAX_PREPARED_STATEMENT_PLACEHOLDERS - MYSQL_PLACEHOLDER_SAFETY_MARGIN) /
        insertColumns.length,
    ),
  );
  const sqlBatchSize = Math.min(DEFAULT_BATCH_SIZE, maxRowsByPlaceholderLimit);
  const assignments = updateColumns
    .filter((column) => column !== 'incident')
    .map(
      (column) =>
        Prisma.sql`${sqlIdentifier(column)} = VALUES(${sqlIdentifier(column)})`,
    );

  if (assignments.length === 0) {
    throw new Error('bulkUpsertTicketRaw requires at least one update column');
  }

  for (const chunk of chunkArray(rows, sqlBatchSize)) {
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
  chunkStartOffset: number,
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
  const batchStartMs = Date.now();
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
    if (i > 0 && i % 100 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const row = rows[i]!;
    try {
      const validationErrors = validateExternalRow(rawRows[i] ?? row as unknown as Record<string, unknown>);
      const fatalErrors = validationErrors.filter(e => e.severity === 'error');
      if (fatalErrors.length > 0) {
        quarantined.push({
          sourceTable,
          batchId,
          reason: fatalErrors.map(e => e.message).join('; ').slice(0, 255),
          rawPayload: (rawRows[i] ?? row._rawPayload) as Prisma.InputJsonValue,
        });
        result.quarantined++;
        result.processed++;
        continue;
      }
      const warningErrors = validationErrors.filter(e => e.severity === 'warn');
      if (warningErrors.length > 0) {
        logger.warn('Row validation warnings', {
          component: 'ingestion',
          incident: row.incident,
          warnings: warningErrors.map(e => e.message),
        });
      }

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
        sourceUpdatedAt,
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

  const {
    changedRows,
    heartbeatRows,
    events,
    inserted,
    updated,
    skipped,
  } = await prisma.$transaction(async (tx) => {
    const CHUNK_SIZE = 20;
    const existingMap = identities.length
      ? new Map(
          (
            await Promise.all(
              chunkArray(identities, CHUNK_SIZE).map(chunk =>
                tx.$queryRawUnsafe<
                  Array<{
                    incident: string | null;
                    sourceHash: string | null;
                    status: string | null;
                    syncVersion: number;
                    sourceUpdatedAt: Date | null;
                  }>
                >(
                  `SELECT incident, sourceHash, status, syncVersion, sourceUpdatedAt
                   FROM ticket_raw
                   WHERE incident IN (${chunk.map(() => '?').join(',')})`,
                  ...chunk,
                ),
              ),
            )
          ).flat().map(row => [row.incident, row]),
        )
      : new Map();
    const events: Array<Parameters<typeof createBulkOutboxEvents>[1][number]> = [];
    const changedRows: TicketRawBulkRow[] = [];
    const heartbeatRows: TicketRawBulkRow[] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of processable) {
      const existing = existingMap.get(item.identity);
      const conflict = resolveConflict(
            existing
          ? {
              sourceHash: existing.sourceHash,
              status: existing.status,
              syncVersion: existing.syncVersion,
              sourceUpdatedAt: existing.sourceUpdatedAt,
            }
          : null,
        item.sourceHash,
        item.normalizedStatus,
        item.sourceUpdatedAt,
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
        inserted++;
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
        updated++;
      } else {
        heartbeatRows.push(data as TicketRawBulkRow);
        skipped++;
      }
      result.processed++;
    }

    const sortedChangedRows = sortTicketRawRowsByIncident(changedRows);
    const sortedHeartbeatRows = sortTicketRawRowsByIncident(heartbeatRows);

    assertNotAborted(signal);
    await bulkUpsertTicketRaw(tx, sortedChangedRows, TICKET_RAW_BULK_COLUMNS);
    // Skip heartbeat upsert — hash & status unchanged, no data to write.
    // lastSeenAt tracking is not critical; stale detection uses updated_at.
    if (quarantined.length > 0) {
      await tx.ingestion_quarantine.createMany({ data: quarantined });
    }

    if (events.length > 0) {
      await createBulkOutboxEvents(tx, events);
    }

    const checkpointData = {
      lastCursorId: batchCursor.lastCursorId,
      lastModifiedAt: normalizeModifiedCheckpoint(
        cursor,
        batchCursor.lastModifiedAt,
      ),
      lastSuccessfulBatchId: batchId,
      status: 'running',
      processedCount: tableResult.processed + inserted + updated + skipped,
      insertedCount: tableResult.inserted + inserted,
      updatedCount: tableResult.updated + updated,
      skippedCount: tableResult.skipped + skipped,
      failedCount: tableResult.failed + result.failed,
      quarantinedCount: tableResult.quarantined + result.quarantined,
      retriedCount: tableResult.retried + result.retried,
      errorMessage: null,
    };
    await tx.ingestion_checkpoint.upsert({
      where: { tableName: sourceTable },
      create: { tableName: sourceTable, ...checkpointData },
      update: checkpointData,
    });

    return { changedRows, heartbeatRows, events, inserted, updated, skipped };
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: Math.min(DEFAULT_TRANSACTION_TIMEOUT_MS, 30_000),
    timeout: DEFAULT_TRANSACTION_TIMEOUT_MS,
  });

  result.inserted += inserted;
  result.updated += updated;
  result.skipped += skipped;
  result.processed = result.inserted + result.updated + result.skipped + result.quarantined + result.failed + result.retried;

  if (inserted > 0 || updated > 0) {
    await requestProjectionRefresh(batchId);
  }

  if (result.retried > 0) {
    logger.info('Ingestion batch completed after retry', {
      component: 'ingestion',
      tableName: sourceTable,
      batchId,
      chunkStartOffset,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      quarantined: result.quarantined,
      retried: result.retried,
    });
  }

  const batchDurationMs = Date.now() - batchStartMs;
  const rowsPerSecond = batchDurationMs > 0
    ? Math.round(((result.processed || 0) / batchDurationMs) * 1000 * 100) / 100
    : 0;
  await Promise.allSettled([
    recordSyncMetric('lastBatchDurationMs', batchDurationMs),
    recordSyncMetric('lastBatchRowsPerSecond', rowsPerSecond),
    recordSyncMetric('lastBatchRows', result.processed || 0),
    setSyncStatus('running', {
      batchDurationMs,
      rowsPerSecond,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      quarantined: result.quarantined,
      retried: result.retried,
      tableName: sourceTable,
      batchId,
      checkpoint: `${batchCursor.lastModifiedAt?.toISOString() ?? '-'}:${batchCursor.lastCursorId ?? '-'}`,
    }),
  ]);

  assertNotAborted(signal);
  return result;
}

/**
 * Shared helper: normalize and process a page of raw rows through the batch
 * pipeline (validation → identity resolution → conflict resolution → upsert →
 * quarantine → events → checkpoint). Used by both MySQL and bridge paths.
 */
export async function processRawRows(
  rawRows: Record<string, unknown>[],
  tableName: string,
  batchId: string,
  cursor: ExternalCursorDefinition,
  result: ChunkResult,
  signal?: AbortSignal,
): Promise<void> {
  const normalizedRows = rawRows.map((row) =>
    normalizeExternalRow(row as unknown as ExternalRow, tableName),
  );
  for (let offset = 0; offset < rawRows.length; offset += adaptiveWriteChunkSize) {
    const rawWindow = rawRows.slice(
      offset,
      Math.min(offset + adaptiveWriteChunkSize, rawRows.length),
    ) as Record<string, unknown>[];
    const normalizedWindow = normalizedRows.slice(
      offset,
      Math.min(offset + adaptiveWriteChunkSize, normalizedRows.length),
    );
    const lastRaw = rawWindow[rawWindow.length - 1] as Record<string, unknown>;
    const nextCursor = getRowCursor(lastRaw, cursor);
    const chunkResult = await withRetry(
      () =>
        processBatch(
          normalizedWindow,
          rawWindow,
          tableName,
          batchId,
          offset,
          nextCursor,
          cursor,
          result,
          signal,
        ),
      {
        retryMax: DEFAULT_RETRY_MAX,
        signal,
        label: 'process_batch',
        context: {
          component: 'ingestion',
          tableName,
          batchId,
          chunkStartOffset: offset,
          chunkSize: normalizedWindow.length,
        },
        onRetry: () => {
          adaptiveWriteChunkSize = Math.max(
            MIN_WRITE_CHUNK_SIZE,
            Math.floor(adaptiveWriteChunkSize / 2),
          );
          result.retried++;
        },
      },
    );
    result.processed = (result.processed ?? 0) + chunkResult.processed;
    result.inserted += chunkResult.inserted;
    result.updated += chunkResult.updated;
    result.skipped += chunkResult.skipped;
    result.failed += chunkResult.failed;
    result.quarantined = (result.quarantined ?? 0) + chunkResult.quarantined;
    result.retried = (result.retried ?? 0) + chunkResult.retried;
    result.errors.push(...chunkResult.errors);
    if (result.errors.length > 100) result.errors.length = 100;
  }
}

async function processTable(
  tableName: string,
  batchId: string,
  mode: IngestionMode,
  signal?: AbortSignal,
): Promise<ChunkResult> {
  const startedAt = nowWib();
  const startMs = Date.now();
  const isBridgeTable =
    isQosmicBridgeConfigured() &&
    (tableName === 'nossa' || tableName === 'nossa_closed');

  const cursor: ExternalCursorDefinition = isBridgeTable
    ? {
        idColumn: null,
        modifiedColumn: null,
        createdAtColumn: null,
        strategy: 'snapshot',
        columns: [],
      }
    : await getExternalCursorDefinition(tableName);
  const persisted = await getOrCreateCheckpoint(tableName, cursor);
  let totalRows = 0;
  if (!isBridgeTable) {
    totalRows = await fetchTableCount(tableName);

    // Cursor stale detection: if cursor is set but no records processed in 24h, reset
    if ((persisted.lastCursorId || persisted.lastModifiedAt) && totalRows > 0) {
      const cursorAge = persisted.lastModifiedAt
        ? Date.now() - persisted.lastModifiedAt.getTime()
        : null;
      const staleThresholdMs =
        (parseInt(process.env.INGESTION_CURSOR_STALE_HOURS || '24', 10)) * 60 * 60_000;
      if (cursorAge !== null && cursorAge > staleThresholdMs) {
        logger.warn('Ingestion cursor may be stale, resetting to 24h window', {
          component: 'ingestion', tableName, cursorAge,
          lastModifiedAt: persisted.lastModifiedAt?.toISOString(),
        });
        persisted.lastCursorId = null;
        persisted.lastModifiedAt = new Date(Date.now() - staleThresholdMs);
        await prisma.ingestion_checkpoint.update({
          where: { tableName },
          data: { lastCursorId: null, lastModifiedAt: persisted.lastModifiedAt },
        });
      }
    }
  }

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

  const runningData = {
    cursorStrategy: cursor.strategy,
    idColumn: cursor.idColumn,
    modifiedColumn: cursor.modifiedColumn,
    status: 'running',
    lastStartedAt: startedAt,
    errorMessage: null,
    ...(mode === 'initial' || mode === 'force_resync'
      ? { lastCursorId: null, lastModifiedAt: null }
      : {}),
  };
  await prisma.ingestion_checkpoint.upsert({
    where: { tableName },
    create: { tableName, ...runningData },
    update: runningData,
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
    mode === 'initial' || mode === 'force_resync'
      ? { lastCursorId: null, lastModifiedAt: null }
      : {
          lastCursorId: persisted.lastCursorId,
          lastModifiedAt: persisted.lastModifiedAt,
        };
  let hasMore = true;
  let snapshotOffset = 0;
  const scanMode = resolveCursorScanMode(cursor);
  const usesSnapshotScan = scanMode === 'snapshot';

  logger.info('Ingestion table run started', {
    component: 'ingestion',
    tableName,
    batchId,
    mode,
    cursorStrategy: cursor.strategy,
    scanMode,
    idColumn: cursor.idColumn,
    modifiedColumn: cursor.modifiedColumn,
    resumeCursorId: activeCursor.lastCursorId,
    resumeModifiedAt: activeCursor.lastModifiedAt?.toISOString() ?? null,
  });

  if (usesSnapshotScan) {
    logger.warn('Ingestion table is using snapshot scan; row movement in source can still cause drift', {
      component: 'ingestion',
      tableName,
      batchId,
      cursorStrategy: cursor.strategy,
    });
  }

  const wibOffset = 7 * 60 * 60 * 1000;
  const wibNowMs = Date.now() + wibOffset;
  const todayStart = new Date(wibNowMs).toISOString().slice(0, 10) + ' 00:00:00';
  const tomorrowStart = new Date(wibNowMs + 86400000).toISOString().slice(0, 10) + ' 00:00:00';

  try {
    if (isBridgeTable) {
      // ====== BRIDGE PATH ======
      // Bridge generators handle pagination internally (no hasMore loop needed).
      if (tableName === 'nossa') {
        for await (const rawRows of iterateNossaOpen({ limit: DEFAULT_CHUNK_SIZE })) {
          if (rawRows.length === 0) break;
          await processRawRows(
            rawRows as unknown as Record<string, unknown>[],
            tableName,
            batchId,
            cursor,
            result,
            signal,
          );
          logger.info('[Ingestion] Bridge nossa page processed', {
            component: 'ingestion',
            tableName,
            batchId,
            mode,
            pageRows: rawRows.length,
            processed: result.processed,
            inserted: result.inserted,
            updated: result.updated,
          });
        }
      } else if (tableName === 'nossa_closed') {
        const isBackfill = mode === 'initial' || mode === 'force_resync';
        if (isBackfill) {
          const fromDate = '2026-01-01';
          const toDate = new Date().toISOString().slice(0, 10);
          for await (const { window: dateWindow, rows } of iterateNossaClosedBackfill(fromDate, toDate)) {
            if (rows.length === 0) break;
            await processRawRows(
              rows as unknown as Record<string, unknown>[],
              tableName,
              batchId,
              cursor,
              result,
              signal,
            );
            logger.info('[Ingestion] Bridge backfill page processed', {
              component: 'ingestion',
              tableName,
              batchId,
              dateWindow,
              pageRows: rows.length,
              processed: result.processed,
              inserted: result.inserted,
              updated: result.updated,
            });
          }
        } else {
          for await (const rawRows of iterateNossaClosedIncremental(7)) {
            if (rawRows.length === 0) break;
            await processRawRows(
              rawRows as unknown as Record<string, unknown>[],
              tableName,
              batchId,
              cursor,
              result,
              signal,
            );
            logger.info('[Ingestion] Bridge incremental page processed', {
              component: 'ingestion',
              tableName,
              batchId,
              pageRows: rawRows.length,
              processed: result.processed,
              inserted: result.inserted,
              updated: result.updated,
            });
          }
        }
      }
      // Bridge tables don't use traditional cursor; just record last run time.
      activeCursor = { lastCursorId: null, lastModifiedAt: nowWib() };
      broadcastBridgeFreshness({
        resource: tableName as 'nossa' | 'nossa_closed',
        lastSyncedAt: nowWib().toISOString(),
        lagSeconds: 0,
      });
    } else {
      // ====== EXISTING MYSQL PATH ======
      const openOnlyFilter = tableName === 'piloting_tickets'
        ? "`status_validasi` = 'OPEN'"
        : undefined;
      while (hasMore) {
        assertNotAborted(signal);
        const rawRows = await withRetry(
          () =>
            usesSnapshotScan
              ? fetchTableRows(tableName, {
                  limit: DEFAULT_CHUNK_SIZE,
                  offset: snapshotOffset,
                  orderBy: cursor.idColumn ?? cursor.columns[0]?.name ?? 'id',
                  columns: cursor.columns.map((c) => c.name),
                  dateFilterColumn: cursor.modifiedColumn,
                  dateFilterStart: todayStart,
                  dateFilterEnd: tomorrowStart,
                })
              : fetchTableRowsByCursor(tableName, {
                  limit: DEFAULT_CHUNK_SIZE,
                  idColumn: cursor.idColumn,
                  modifiedColumn: cursor.modifiedColumn,
                  lastCursorId: activeCursor.lastCursorId,
                  lastModifiedAt: activeCursor.lastModifiedAt,
                  columns: cursor.columns.map((c) => c.name),
                  extraWhere: openOnlyFilter,
                }),
          {
            retryMax: DEFAULT_RETRY_MAX,
            signal,
            label: 'fetch_external_rows',
            context: {
              component: 'ingestion',
              tableName,
              batchId,
              cursorStrategy: cursor.strategy,
              snapshotOffset: usesSnapshotScan ? snapshotOffset : undefined,
              lastCursorId: usesSnapshotScan ? undefined : activeCursor.lastCursorId,
              lastModifiedAt: usesSnapshotScan
                ? undefined
                : activeCursor.lastModifiedAt?.toISOString() ?? null,
            },
            onRetry: () => {
              result.retried++;
            },
          },
        );

        if (rawRows.length === 0) break;
        const normalizedRows = rawRows.map((row) =>
          normalizeExternalRow(row as unknown as ExternalRow, tableName),
        );
        for (let offset = 0; offset < rawRows.length; offset += DEFAULT_WRITE_CHUNK_SIZE) {
          const rawWindow = rawRows.slice(
            offset,
            Math.min(offset + DEFAULT_WRITE_CHUNK_SIZE, rawRows.length),
          ) as Record<string, unknown>[];
          const normalizedWindow = normalizedRows.slice(
            offset,
            Math.min(offset + DEFAULT_WRITE_CHUNK_SIZE, normalizedRows.length),
          );
          const lastRaw = rawWindow[rawWindow.length - 1] as Record<string, unknown>;
          const nextCursor = getRowCursor(lastRaw, cursor);
          const chunkResult = await withRetry(
            () =>
              processBatch(
                normalizedWindow,
                rawWindow,
                tableName,
                batchId,
                offset,
                nextCursor,
                cursor,
                result,
                signal,
              ),
            {
              retryMax: DEFAULT_RETRY_MAX,
              signal,
              label: 'process_batch',
              context: {
                component: 'ingestion',
                tableName,
                batchId,
                chunkStartOffset: offset,
                chunkSize: normalizedWindow.length,
                snapshotOffset: usesSnapshotScan ? snapshotOffset : undefined,
              },
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
          if (result.errors.length > 100) result.errors.length = 100;
          activeCursor = {
            lastCursorId: nextCursor.lastCursorId,
            lastModifiedAt: normalizeModifiedCheckpoint(
              cursor,
              nextCursor.lastModifiedAt,
            ),
          };
        }
        if (usesSnapshotScan) {
          activeCursor = { lastCursorId: null, lastModifiedAt: null };
          snapshotOffset += rawRows.length;
        }
        hasMore = rawRows.length === DEFAULT_CHUNK_SIZE;
        logger.info('[Ingestion] Processing complete:', { tableName, mode, processed: result.processed, totalRows, inserted: result.inserted, updated: result.updated, skipped: result.skipped, quarantined: result.quarantined });
      }

      // Catch CLOSE transitions for piloting_tickets — fetch once right after close
      if (
        tableName === 'piloting_tickets' &&
        activeCursor.lastModifiedAt
      ) {
        const closeRows = await fetchTableRowsByCursor(tableName, {
          limit: 10000,
          idColumn: cursor.idColumn,
          modifiedColumn: cursor.modifiedColumn,
          lastCursorId: null,
          lastModifiedAt: activeCursor.lastModifiedAt,
          columns: cursor.columns.map((c) => c.name),
          extraWhere: "`status_validasi` = 'CLOSE'",
        });
        if (closeRows.length > 0) {
          logger.info('[CLOSE-catch] Detected CLOSE transitions', {
            count: closeRows.length,
            tableName,
          });
          await processRawRows(
            closeRows as Record<string, unknown>[],
            tableName,
            batchId,
            cursor,
            result,
            signal,
          );
        }
      }
    }

    const successData = {
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
    };
    await prisma.ingestion_checkpoint.upsert({
      where: { tableName },
      create: { tableName, ...successData },
      update: successData,
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
    logger.info('Ingestion table run completed', {
      component: 'ingestion',
      tableName,
      batchId,
      mode,
      cursorStrategy: cursor.strategy,
      scanMode,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      quarantined: result.quarantined,
      retried: result.retried,
      checkpointCursorId: activeCursor.lastCursorId,
      checkpointModifiedAt: activeCursor.lastModifiedAt?.toISOString() ?? null,
      durationMs: Date.now() - startMs,
    });
    return result;
  } catch (error) {
    const message = String(error);
    result.failed++;
    result.errors.push({ incident: 'table', error: message });
    const failureStatus = message.includes('Ingestion aborted') ? 'aborted' : 'failed';
    await prisma.ingestion_checkpoint.upsert({
      where: { tableName },
      create: {
        tableName,
        status: failureStatus,
        lastCursorId: activeCursor.lastCursorId,
        lastModifiedAt: activeCursor.lastModifiedAt,
        failedCount: result.failed,
        errorMessage: message,
        lastFinishedAt: nowWib(),
      },
      update: {
        status: failureStatus,
        lastCursorId: activeCursor.lastCursorId,
        lastModifiedAt: activeCursor.lastModifiedAt,
        failedCount: result.failed,
        errorMessage: message,
        lastFinishedAt: nowWib(),
      },
    });
    await prisma.ingestion_run_log.update({
      where: { id: runLog.id },
      data: {
        status: message.includes('Ingestion aborted') ? 'aborted' : 'failed',
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
        errorMessage: message,
        finishedAt: nowWib(),
      },
    });
    logger.error('Ingestion table run failed', error, {
      component: 'ingestion',
      tableName,
      batchId,
      mode,
      cursorStrategy: cursor.strategy,
      scanMode,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      quarantined: result.quarantined,
      retried: result.retried,
      checkpointCursorId: activeCursor.lastCursorId,
      checkpointModifiedAt: activeCursor.lastModifiedAt?.toISOString() ?? null,
      durationMs: Date.now() - startMs,
    });
    throw error;
  }
}

async function runIngestionMode(
  mode: IngestionMode,
  signal?: AbortSignal,
): Promise<SyncResult> {
  await setSyncStatus('running', {});
  await setMySQLSessionTimeout(120_000);
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
        if (result.errors.length > 100) result.errors.length = 100;
      } catch (error) {
        const message = String(error);
        result.failed++;
        result.errors.push({ table: tableName, incident: 'table', error: message });
        if (result.errors.length > 100) result.errors.length = 100;
        await emitIngestionFailedEvent(batchId, tableName, message);
        throw error;
      }
    });

    const duration = Date.now() - start;
    const rowsPerSecond = duration > 0
      ? Math.round(((result.processed || 0) / duration) * 1000 * 100) / 100
      : 0;
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
      rowsPerSecond,
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
    const duration = Date.now() - start;
    await setSyncStatus('failed', {
      duration,
      rowsPerSecond: duration > 0 ? Math.round(((result.processed || 0) / duration) * 1000 * 100) / 100 : 0,
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
  logger.info('[Ingestion] Starting initial full load...');
  return runIngestionMode('initial', signal);
}

export async function runIncrementalSync(signal?: AbortSignal): Promise<SyncResult> {
  logger.info('[Ingestion] Starting incremental sync...');
  return runIngestionMode('incremental', signal);
}

export async function runRecoveryIngestion(signal?: AbortSignal): Promise<SyncResult> {
  logger.info('[Ingestion] Starting recovery from checkpoints...');
  return runIngestionMode('recovery', signal);
}

export async function runForceResync(signal?: AbortSignal): Promise<SyncResult> {
  logger.info('[Ingestion] Starting force resync without deleting data...');
  return runIngestionMode('force_resync', signal);
}

export async function retryQuarantinedItems(options?: {
  batchSize?: number;
  maxRetries?: number;
}): Promise<{ processed: number; recovered: number; failed: number }> {
  if (!isRedisReady()) return { processed: 0, recovered: 0, failed: 0 };

  const batchSize = options?.batchSize ?? 50;
  const maxRetries = options?.maxRetries ?? 3;
  const now = nowWib();
  const batchId = `dlq-retry-${Date.now()}`;

  const quarantined = await prisma.ingestion_quarantine.findMany({
    take: batchSize,
    orderBy: { createdAt: 'asc' },
  });

  const result = { processed: 0, recovered: 0, failed: 0 };

  for (const item of quarantined) {
    result.processed++;

    const retryKey = `dlq:retries:${item.id}`;
    const retryCountStr = await redis.get(retryKey).catch(() => null);
    const retryCount = retryCountStr ? parseInt(retryCountStr, 10) : 0;

    if (retryCount >= maxRetries) {
      logger.warn('Quarantined item exceeded max retries, skipping', {
        component: 'ingestion',
        quarantineId: String(item.id),
        sourceTable: item.sourceTable,
        retryCount,
      });
      continue;
    }

    try {
      const rawPayload = item.rawPayload as Record<string, unknown>;
      const externalRow = rawPayload as unknown as ExternalRow;
      const normalizedRow = normalizeExternalRow(externalRow, item.sourceTable);

      const identity = resolveIdentityStrict(normalizedRow);
      if (!identity.valid || !identity.primaryIdentity) {
        await redis.setex(retryKey, 86400, String(retryCount + 1)).catch(() => {});
        result.failed++;
        continue;
      }

      const sourceHash = computeSourceHash(normalizedRow);
      const data = buildRawData(
        normalizedRow,
        sourceHash,
        now,
        batchId,
        1,
        item.sourceTable,
        identity.primaryIdentity,
      );

      await prisma.$transaction(async (tx) => {
        await tx.ticket_raw.upsert({
          where: { incident: identity.primaryIdentity ?? undefined },
          create: data as Prisma.ticket_rawUncheckedCreateInput,
          update: {
            ...data as Prisma.ticket_rawUncheckedCreateInput,
            isActive: true,
          },
        });
        await tx.ingestion_quarantine.delete({ where: { id: item.id } });
      });
      await redis.del(retryKey).catch(() => {});
      result.recovered++;
    } catch (error) {
      const newRetryCount = retryCount + 1;
      await redis.setex(retryKey, 86400, String(newRetryCount)).catch(() => {});
      result.failed++;
    }
  }

  return result;
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
