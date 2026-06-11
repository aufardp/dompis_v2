import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { format, toZonedTime } from 'date-fns-tz';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import {
  batchClassifyJenisFromVlookup,
  resetVlookupCache,
  refreshVlookupCache,
} from '@/lib/classify-jenis-vlookup';
import { recordProjectionMetric, setProjectionStatus } from '@/lib/sync-metrics/metrics';
import { setMySQLSessionTimeout } from '@/lib/workers/task-runner';
import { isTicketClosed, normalizeStatusUpdate, CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { logger } from '@/lib/observability/logger';
import { quarantine } from '@/lib/dlq';

const TIMEZONE = 'Asia/Jakarta';
const CHECKPOINT_NAME = 'ticket_raw_to_ticket';
let consecutiveZeroProcessed = 0;

const PROTECTED_STATES = new Set([
  'assigned',
  'on_progress',
  'pending',
  'close',
  'closed',
]);

const DEFAULT_BATCH_SIZE = parsePositiveIntEnv('PROJECTION_BATCH_SIZE', 1000);
const DEFAULT_WRITE_CHUNK_SIZE = parsePositiveIntEnv(
  'PROJECTION_WRITE_CHUNK_SIZE',
  Math.min(DEFAULT_BATCH_SIZE, 1000),
);
const DEFAULT_CONCURRENCY = parsePositiveIntEnv('PROJECTION_CONCURRENCY', 2);
const DEFAULT_RETRY_MAX = parsePositiveIntEnv('PROJECTION_RETRY_MAX', 3);
const DEFAULT_TRANSACTION_TIMEOUT_MS = parsePositiveIntEnv(
  'PROJECTION_TRANSACTION_TIMEOUT_MS',
  30_000,
);
const RETRY_BASE_DELAY_MS = parsePositiveIntEnv(
  'PROJECTION_RETRY_BASE_DELAY_MS',
  250,
);

const TRANSIENT_ERROR_PATTERNS = [
  'deadlock',
  'lock wait timeout',
  'timeout',
  'timed out',
  'connection',
  'connection reset',
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

export function computeFlaggingManja(
  bookingDate: string | null,
): string | null {
  const parsed = parseExternalDateInWib(bookingDate);
  if (!parsed) return null;

  const bookingDateStr = format(toZonedTime(parsed, TIMEZONE), 'yyyy-MM-dd', {
    timeZone: TIMEZONE,
  });
  const todayStr = format(toZonedTime(new Date(), TIMEZONE), 'yyyy-MM-dd', {
    timeZone: TIMEZONE,
  });
  const bookingHour = Number(
    format(toZonedTime(parsed, TIMEZONE), 'H', { timeZone: TIMEZONE }),
  );

  if (bookingDateStr === todayStr && bookingHour <= 15) return 'P1';
  if (bookingDateStr < todayStr) return 'P1';
  return 'P+';
}

export interface StatusUpdateResolution {
  statusUpdate?: string;
  closedAt?: Date | null;
  protected: boolean;
}

export function resolveProjectionStatusUpdate(
  currentStatusUpdate: string | null,
  externalStatus: string | null,
  teknisiUserId: number | null,
): StatusUpdateResolution | null {
  const current = (currentStatusUpdate ?? '').trim().toLowerCase();
  const external = (externalStatus ?? '').trim().toLowerCase();

  if (current && PROTECTED_STATES.has(current)) {
    return { protected: true };
  }

  const isExternalClosed = external === 'close' || external === 'closed'
    || CLOSE_STATUS_VALUES.some(s => s.toLowerCase() === external);
  const isUnassigned = !teknisiUserId;

  if (isExternalClosed && isUnassigned) {
    return { statusUpdate: 'close', closedAt: nowWib(), protected: false };
  }

  if (isUnassigned && !isTicketClosed(current)) {
    const normalized = normalizeStatusUpdate(current);
    if (normalized === 'open') return null;
    return { statusUpdate: 'open', closedAt: null, protected: false };
  }

  return null;
}

interface ProjectionResult {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  retried: number;
  setToOpen: number;
  setToClose: number;
  protected: number;
  checkpoint: {
    lastProjectedImportedAt: Date | null;
    lastProjectedTicketRawId: string | null;
    syncBatchId: string | null;
  };
  duration?: number;
  errors: Array<{ incident: string; error: string }>;
}

interface ProjectionOptions {
  batchSize?: number;
  concurrency?: number;
  retryMax?: number;
  since?: Date;
  syncBatchId?: string;
  mode?: 'incremental' | 'full' | 'batch';
  preserveCheckpointCursor?: boolean;
  skipAutoRepair?: boolean;
}

interface ProjectionCheckpoint {
  lastProjectedImportedAt: Date | null;
  lastProjectedTicketRawId: string | null;
  lastSyncBatchId: string | null;
  neverProjectedCount: number;
}

interface RawSelectResult {
  id_ticket: string;
  incident: string | null;
  sourceTable: string | null;
  sourceHash: string | null;
  syncVersion: number;
  status: string | null;
  importedAt: Date | null;
  syncBatchId: string | null;
  [key: string]: unknown;
}

interface ExistingTicket {
  id_ticket: number;
  incident: string;
  teknisi_user_id: number | null;
  description_solution_dompis: string | null;
  pending_dompis: string | null;
  pending_reason: string | null;
  synced_at: Date | null;
  import_batch: string | null;
  status_update: string | null;
  closed_at: Date | null;
  rca: string | null;
  sub_rca: string | null;
  status_manja: string | null;
  alamat: string | null;
}

interface ExistingProjectionLog {
  ticketRawId: string;
  sourceHash: string | null;
  syncVersion: number | null;
  status: string;
}

interface ProjectionItem {
  raw: RawSelectResult;
  upsert: Prisma.ticketUpsertArgs;
  action: 'inserted' | 'updated' | 'skipped';
  protected: boolean;
  statusResolution: StatusUpdateResolution | null;
}

const PROJECTED_FIELDS: Record<string, string> = {
  incident: 'incident',
  summary: 'summary',
  reported_date: 'reported_date',
  owner_group: 'owner_group',
  customer_segment: 'customer_segment',
  service_type: 'service_type',
  workzone: 'workzone',
  status: 'status',
  status_date: 'status_date',
  ticket_id_gamas: 'ticket_id_gamas',
  contact_phone: 'contact_phone',
  contact_name: 'contact_name',
  booking_date: 'booking_date',
  source_ticket: 'source_ticket',
  customer_type: 'customer_type',
  customer_name: 'customer_name',
  service_no: 'service_no',
  symptom: 'symptom',
  description_actual_solution: 'description_actual_solution',
  device_name: 'device_name',
  rk_information: 'rk_information',
  witel: 'witel',
  worklog_summary: 'worklog_summary',
  realm: 'realm',
  sn_ont: 'sn_ont',
  tipe_ont: 'tipe_ont',
  guarantee_status: 'guarantee_status',
  lapul: 'lapul',
  gaul: 'gaul',
  onu_rx: 'onu_rx',
  street_address: 'alamat',
  channel: 'channel',
  classification_flag: 'classification_flag',
  classification_path: 'classification_path',
  incident_domain: 'incident_domain',
  solution: 'solution',
  tsc_result: 'tsc_result',
  scc_result: 'scc_result',
  pending_reason: 'pending_reason',
};

const PROTECTED_FIELDS = new Set([
  'teknisi_user_id',
  'status_update',
  'rca',
  'sub_rca',
  'status_manja',
  'description_solution_dompis',
  'pending_dompis',
]);

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const TICKET_BULK_COLUMNS: readonly string[] = [
  'sync_date', 'import_batch', 'synced_at', 'incident',
  'workzone', 'customer_type', 'summary', 'reported_date',
  'owner_group', 'customer_segment', 'service_type', 'ticket_id_gamas',
  'contact_phone', 'contact_name', 'booking_date', 'source_ticket',
  'customer_name', 'service_no', 'symptom', 'device_name',
  'rk_information', 'witel', 'worklog_summary', 'realm',
  'sn_ont', 'tipe_ont', 'guarantee_status', 'lapul', 'gaul', 'onu_rx',
  'jenis_tiket_1', 'jenis_tiket_2', 'channel', 'classification_flag', 'classification_path',
  'incident_domain', 'solution', 'tsc_result', 'scc_result',
  'description_actual_solution', 'alamat', 'status', 'status_date', 'status_update', 'closed_at', 'flagging_manja', 'pending_reason',
];

const LOG_BULK_COLUMNS: readonly string[] = [
  'ticketRawId', 'incident', 'syncBatchId', 'importedAt',
  'action', 'status', 'attempts', 'sourceHash', 'syncVersion', 'projectedAt',
];

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

function getTicketRow(item: ProjectionItem): Record<string, unknown> {
  const source = item.action === 'inserted'
    ? (item.upsert.create as Record<string, unknown>)
    : (item.upsert.update as Record<string, unknown>);
  return Object.fromEntries(
    TICKET_BULK_COLUMNS.map(col => [col, toSqlValue(source[col] ?? null)]),
  );
}

function getLogRow(item: ProjectionItem, attempts: number): Record<string, unknown> {
  return Object.fromEntries(
    LOG_BULK_COLUMNS.map(col => {
      switch (col) {
        case 'ticketRawId': return [col, item.raw.id_ticket];
        case 'incident': return [col, item.raw.incident];
        case 'syncBatchId': return [col, item.raw.syncBatchId];
        case 'importedAt': return [col, item.raw.importedAt];
        case 'action': return [col, item.action];
        case 'status': return [col, 'success'];
        case 'attempts': return [col, attempts];
        case 'sourceHash': return [col, item.raw.sourceHash];
        case 'syncVersion': return [col, item.raw.syncVersion];
        case 'projectedAt': return [col, nowWib()];
        default: return [col, null];
      }
    }),
  );
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Projection aborted');
  }
}

function parseExternalDateInWib(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate = new Date(hasTimezone ? normalized : `${normalized}+07:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function isTransientProjectionError(error: unknown): boolean {
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
      reject(new Error('Projection aborted'));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new Error('Projection aborted'));
      },
      { once: true },
    );
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retryMax: number; signal?: AbortSignal; onRetry: () => void },
): Promise<{ value: T; attempts: number }> {
  let attempts = 0;
  let lastError: unknown;
  while (attempts <= options.retryMax) {
    assertNotAborted(options.signal);
    try {
      return { value: await fn(), attempts: attempts + 1 };
    } catch (error) {
      lastError = error;
      if (attempts >= options.retryMax || !isTransientProjectionError(error)) {
        throw error;
      }
      attempts++;
      options.onRetry();
      const jitter = Math.floor(Math.random() * RETRY_BASE_DELAY_MS);
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1) + jitter, options.signal);
    }
  }
  throw lastError;
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
    logger.warn('[Projection] Worker rejected:', { error: String(r.reason) });
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getOrCreateCheckpoint(): Promise<
  ProjectionCheckpoint & { neverProjectedCount: number }
> {
  const row = await prisma.ticket_projection_checkpoint.upsert({
    where: { name: CHECKPOINT_NAME },
    create: { name: CHECKPOINT_NAME, status: 'idle' },
    update: {},
    select: {
      lastProjectedImportedAt: true,
      lastProjectedTicketRawId: true,
      lastSyncBatchId: true,
      neverProjectedCount: true,
    },
  });
  return row;
}

function buildProjectionUpsert(
  raw: RawSelectResult,
  existing: ExistingTicket | undefined,
  jenisTiket1: string | null,
  jenisTiket2: string | null,
  now: Date,
  syncDate: Date,
): Omit<ProjectionItem, 'raw' | 'action'> {
  const base: Record<string, unknown> = {
    sync_date: syncDate,
    import_batch: raw.syncBatchId,
    synced_at: now,
    incident: raw.incident!,
    workzone: raw.workzone,
    customer_type: raw.customer_type,
    summary: raw.summary,
    reported_date: raw.reported_date,
    owner_group: raw.owner_group,
    customer_segment: raw.customer_segment,
    service_type: raw.service_type,
    ticket_id_gamas: raw.ticket_id_gamas,
    contact_phone: raw.contact_phone,
    contact_name: raw.contact_name,
    booking_date: raw.booking_date,
    source_ticket: raw.source_ticket,
    customer_name: raw.customer_name,
    service_no: raw.service_no,
    symptom: raw.symptom,
    device_name: raw.device_name,
    rk_information: raw.rk_information,
    witel: raw.witel,
    worklog_summary: raw.worklog_summary,
    realm: raw.realm,
    sn_ont: raw.sn_ont,
    tipe_ont: raw.tipe_ont,
    guarantee_status: raw.guarantee_status,
    lapul: raw.lapul,
    gaul: raw.gaul,
    onu_rx: raw.onu_rx,
    jenis_tiket_1: jenisTiket1,
    jenis_tiket_2: jenisTiket2,
    channel: raw.channel,
    classification_flag: raw.classification_flag,
    classification_path: raw.classification_path,
  };

  for (const [rawField, ticketField] of Object.entries(PROJECTED_FIELDS)) {
    if (PROTECTED_FIELDS.has(ticketField)) continue;
    const value = raw[rawField];
    if (value !== null && value !== undefined) {
      base[ticketField] = value;
    }
  }

  const updateData = { ...base };
  if (existing?.teknisi_user_id) delete updateData.alamat;

  const statusResolution = resolveProjectionStatusUpdate(
    existing?.status_update ?? null,
    raw.status ?? null,
    existing?.teknisi_user_id ?? null,
  );
  if (statusResolution && !statusResolution.protected) {
    if (statusResolution.statusUpdate !== undefined) {
      updateData.status_update = statusResolution.statusUpdate;
    }
    if (statusResolution.closedAt !== undefined) {
      updateData.closed_at = statusResolution.closedAt;
    }
  } else if (existing) {
    if (existing.status_update !== undefined) {
      updateData.status_update = existing.status_update;
    }
    if (existing.closed_at !== undefined) {
      updateData.closed_at = existing.closed_at;
    }
  }

  const newFlagging = computeFlaggingManja(raw.booking_date as string | null);
  if (newFlagging) updateData.flagging_manja = newFlagging;

  const createData: Record<string, unknown> = {
    ...base,
    alamat: raw.street_address,
  };
  const createResolution = resolveProjectionStatusUpdate(
    null,
    raw.status ?? null,
    null,
  );
  if (createResolution?.statusUpdate) {
    createData.status_update = createResolution.statusUpdate;
    if (createResolution.closedAt) createData.closed_at = createResolution.closedAt;
  } else {
    createData.status_update = 'open';
  }
  createData.flagging_manja = computeFlaggingManja(raw.booking_date as string | null);

  return {
    upsert: {
      where: { incident: raw.incident! },
      create: createData as Prisma.ticketCreateInput,
      update: updateData as Prisma.ticketUpdateInput,
    },
    protected: Boolean(statusResolution?.protected || existing?.teknisi_user_id),
    statusResolution,
  };
}

export function shouldSkipProjection(
  raw: RawSelectResult,
  existing: ExistingTicket | undefined,
  projectionLog: ExistingProjectionLog | undefined,
): boolean {
  // Manual imports must always be projected into `ticket`.
  // They can still be de-duplicated by the ticket upsert itself, but
  // we should not short-circuit them here based on previous projection state.
  if (raw.sourceTable === 'import_tiket') {
    return false;
  }

  if (
    projectionLog?.status === 'success' &&
    projectionLog.sourceHash === raw.sourceHash &&
    projectionLog.syncVersion === raw.syncVersion
  ) {
    return true;
  }

  return Boolean(
    existing?.synced_at &&
      raw.importedAt &&
      existing.import_batch === raw.syncBatchId &&
      existing.synced_at >= raw.importedAt,
  );
}

async function fetchBatch(
  checkpoint: ProjectionCheckpoint,
  options: Required<Pick<ProjectionOptions, 'batchSize'>> & ProjectionOptions,
): Promise<RawSelectResult[]> {
  const cursorFilter: Prisma.ticket_rawWhereInput =
    checkpoint.lastProjectedImportedAt
      ? {
          OR: [
            { importedAt: { gt: checkpoint.lastProjectedImportedAt } },
            {
              importedAt: checkpoint.lastProjectedImportedAt,
              id_ticket: { gt: checkpoint.lastProjectedTicketRawId ?? '' },
            },
          ],
        }
      : {};

  const where: Prisma.ticket_rawWhereInput = {
    isActive: true,
    importedAt: { not: null },
    ...(options.syncBatchId ? { syncBatchId: options.syncBatchId } : {}),
    ...(options.since ? { importedAt: { gte: options.since } } : cursorFilter),
  };

  return prisma.ticket_raw.findMany({
    where,
    take: options.batchSize,
    orderBy: [{ importedAt: 'asc' }, { id_ticket: 'asc' }],
    select: {
      id_ticket: true,
      incident: true,
      sourceTable: true,
      sourceHash: true,
      syncVersion: true,
      status: true,
      importedAt: true,
      syncBatchId: true,
      summary: true,
      reported_date: true,
      owner_group: true,
      customer_segment: true,
      service_type: true,
      workzone: true,
      status_date: true,
      ticket_id_gamas: true,
      contact_phone: true,
      contact_name: true,
      booking_date: true,
      source_ticket: true,
      customer_type: true,
      customer_name: true,
      service_no: true,
      symptom: true,
      description_actual_solution: true,
      device_name: true,
      rk_information: true,
      witel: true,
      worklog_summary: true,
      realm: true,
      sn_ont: true,
      tipe_ont: true,
      guarantee_status: true,
      lapul: true,
      gaul: true,
      onu_rx: true,
      street_address: true,
      channel: true,
      classification_flag: true,
      classification_path: true,
      incident_domain: true,
      solution: true,
      tsc_result: true,
      scc_result: true,
      pending_reason: true,
    },
  }) as Promise<RawSelectResult[]>;
}

async function prepareProjectionItems(
  rawRecords: RawSelectResult[],
): Promise<ProjectionItem[]> {
  const validRawRecords = rawRecords.filter((r) => r.incident && r.importedAt);
  if (validRawRecords.length === 0) return [];

  const jenisResults = await batchClassifyJenisFromVlookup(
    validRawRecords.map((r) => ({
      channel: r.channel as string | null,
      classification_flag: r.classification_flag as string | null,
      classification_path: r.classification_path as string | null,
      customer_type: r.customer_type as string | null,
      customer_segment: r.customer_segment as string | null,
      service_type: r.service_type as string | null,
      service_no: r.service_no as string | null,
      source_ticket: r.source_ticket as string | null,
      realm: r.realm as string | null,
      summary: r.summary as string | null,
    })),
  );

  const incidents = validRawRecords.map((r) => r.incident!) as string[];
  const existingTickets = await prisma.ticket.findMany({
    where: { incident: { in: incidents } },
    select: {
      id_ticket: true,
      incident: true,
      teknisi_user_id: true,
      description_solution_dompis: true,
      pending_dompis: true,
      pending_reason: true,
      synced_at: true,
      import_batch: true,
      status_update: true,
      closed_at: true,
      rca: true,
      sub_rca: true,
      status_manja: true,
      alamat: true,
    },
  });
  const existingMap = new Map(existingTickets.map((t) => [t.incident, t]));
  const projectionLogCandidates = validRawRecords.filter((raw) => {
    const existing = existingMap.get(raw.incident!);
    if (!existing?.synced_at || !raw.importedAt) {
      return true;
    }

    return !(
      existing.import_batch === raw.syncBatchId &&
      existing.synced_at >= raw.importedAt
    );
  });

  const projectionLogs = projectionLogCandidates.length > 0
    ? await prisma.ticket_projection_log.findMany({
        where: {
          ticketRawId: { in: projectionLogCandidates.map((r) => r.id_ticket) },
        },
        select: {
          ticketRawId: true,
          sourceHash: true,
          syncVersion: true,
          status: true,
        },
      })
    : [];
  const projectionLogMap = new Map(
    projectionLogs.map((log) => [log.ticketRawId, log as ExistingProjectionLog]),
  );

  const now = nowWib();
  const syncDate = todayWibDateForDb();
  const items: ProjectionItem[] = [];
  for (let i = 0; i < validRawRecords.length; i++) {
    if (i > 0 && i % 500 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const raw = validRawRecords[i]!;
    const existing = existingMap.get(raw.incident!);
    const projection = buildProjectionUpsert(
      raw,
      existing,
      jenisResults[i]?.jenis_tiket_1 ?? null,
      jenisResults[i]?.jenis_tiket_2 ?? null,
      now,
      syncDate,
    );
    items.push({
      raw,
      ...projection,
      action: !existing
        ? 'inserted'
        : shouldSkipProjection(raw, existing, projectionLogMap.get(raw.id_ticket))
          ? 'skipped'
          : 'updated',
    });
  }
  return items;
}

async function markProjectionFailure(
  item: ProjectionItem,
  error: unknown,
  attempts: number,
): Promise<void> {
  await prisma.ticket_projection_log.upsert({
    where: { ticketRawId: item.raw.id_ticket },
    create: {
      ticketRawId: item.raw.id_ticket,
      incident: item.raw.incident ?? 'unknown',
      syncBatchId: item.raw.syncBatchId,
      importedAt: item.raw.importedAt,
      action: item.action,
      status: 'failed',
      attempts,
      sourceHash: item.raw.sourceHash,
      syncVersion: item.raw.syncVersion,
      error: String(error),
      projectedAt: nowWib(),
    },
    update: {
      action: item.action,
      status: 'failed',
      attempts,
      error: String(error),
      projectedAt: nowWib(),
    },
  });
}

async function advanceCheckpoint(
  tx: Prisma.TransactionClient,
  lastRecord: RawSelectResult,
  result: ProjectionResult,
  syncBatchId: string | null,
  options: {
    preserveCursor: boolean;
    preservedCheckpoint: ProjectionCheckpoint;
  },
): Promise<void> {
  if (!lastRecord.importedAt) {
    throw new Error('Projection cursor requires importedAt on ticket_raw');
  }
  await tx.ticket_projection_checkpoint.update({
    where: { name: CHECKPOINT_NAME },
    data: {
      lastProjectedImportedAt: options.preserveCursor
        ? options.preservedCheckpoint.lastProjectedImportedAt
        : lastRecord.importedAt,
      lastProjectedTicketRawId: options.preserveCursor
        ? options.preservedCheckpoint.lastProjectedTicketRawId
        : lastRecord.id_ticket,
      lastSyncBatchId: options.preserveCursor
        ? options.preservedCheckpoint.lastSyncBatchId
        : syncBatchId,
      status: 'success',
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      retried: result.retried,
      protected: result.protected,
      lastError: null,
      completedAt: nowWib(),
    },
  });
  result.checkpoint = {
    lastProjectedImportedAt: options.preserveCursor
      ? options.preservedCheckpoint.lastProjectedImportedAt
      : lastRecord.importedAt,
    lastProjectedTicketRawId: options.preserveCursor
      ? options.preservedCheckpoint.lastProjectedTicketRawId
      : lastRecord.id_ticket,
    syncBatchId: options.preserveCursor
      ? options.preservedCheckpoint.lastSyncBatchId
      : syncBatchId,
  };
}

async function withTransactionRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: 'ReadCommitted',
        maxWait: 10_000,
        timeout: DEFAULT_TRANSACTION_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = /1205|lock wait timeout|deadlock|1213/i.test(msg);
      if (!isRetryable || attempt >= maxRetries) throw err;
      const delay = 500 * Math.pow(2, attempt);
      logger.warn('[Projection] Transaction retry:', { attempt: attempt + 1, maxRetries, delayMs: delay, error: msg.slice(0, 80) });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Transaction retry exhausted');
}

async function bulkUpsertTicket(
  tx: Prisma.TransactionClient,
  items: ProjectionItem[],
): Promise<void> {
  if (items.length === 0) return;
  const updateColumns = TICKET_BULK_COLUMNS.filter(c => c !== 'incident');
  const rows = items.map(item => getTicketRow(item));
  await tx.$executeRaw`
    INSERT INTO ${sqlIdentifier('ticket')}
      (${Prisma.join(TICKET_BULK_COLUMNS.map(c => sqlIdentifier(c)))})
    VALUES ${Prisma.join(
      rows.map(row =>
        Prisma.sql`(${Prisma.join(TICKET_BULK_COLUMNS.map(c => toSqlValue(row[c])))})`,
      ),
    )}
    ON DUPLICATE KEY UPDATE
      ${Prisma.join(updateColumns.map(c => Prisma.sql`${sqlIdentifier(c)} = VALUES(${sqlIdentifier(c)})`))}
  `;
}

async function bulkInsertTicket(
  tx: Prisma.TransactionClient,
  items: ProjectionItem[],
): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map(item => getTicketRow(item));
  await tx.$executeRaw`
    INSERT IGNORE INTO ${sqlIdentifier('ticket')}
      (${Prisma.join(TICKET_BULK_COLUMNS.map(c => sqlIdentifier(c)))})
    VALUES ${Prisma.join(
      rows.map(row =>
        Prisma.sql`(${Prisma.join(TICKET_BULK_COLUMNS.map(c => toSqlValue(row[c])))})`,
      ),
    )}
  `;
}

async function bulkUpsertProjectionLog(
  tx: Prisma.TransactionClient,
  items: ProjectionItem[],
  attempts: number,
): Promise<void> {
  if (items.length === 0) return;
  const updateColumns = LOG_BULK_COLUMNS.filter(c => c !== 'ticketRawId');
  const rows = items.map(item => getLogRow(item, attempts));
  await tx.$executeRaw`
    INSERT INTO ${sqlIdentifier('ticket_projection_log')}
      (${Prisma.join(LOG_BULK_COLUMNS.map(c => sqlIdentifier(c)))})
    VALUES ${Prisma.join(
      rows.map(row =>
        Prisma.sql`(${Prisma.join(LOG_BULK_COLUMNS.map(c => toSqlValue(row[c])))})`,
      ),
    )}
    ON DUPLICATE KEY UPDATE
      ${Prisma.join(updateColumns.map(c => Prisma.sql`${sqlIdentifier(c)} = VALUES(${sqlIdentifier(c)})`))}
  `;
}

async function projectSubBatchAtomically(
  items: ProjectionItem[],
  lastRecord: RawSelectResult,
  result: ProjectionResult,
  options: {
    attempts: number;
    syncBatchId: string | null;
    preserveCheckpointCursor: boolean;
    preservedCheckpoint: ProjectionCheckpoint;
    signal?: AbortSignal;
  },
): Promise<void> {
  await withTransactionRetry(async (tx) => {
    assertNotAborted(options.signal);

    const newItems = items.filter(i => i.action === 'inserted');
    const updatedItems = items.filter(i => i.action === 'updated');

    if (newItems.length > 0) {
      await bulkInsertTicket(tx, newItems);
    }
    if (updatedItems.length > 0) {
      await bulkUpsertTicket(tx, updatedItems);
    }
    await bulkUpsertProjectionLog(tx, items, options.attempts);

    await advanceCheckpoint(tx, lastRecord, result, options.syncBatchId, {
      preserveCursor: options.preserveCheckpointCursor,
      preservedCheckpoint: options.preservedCheckpoint,
    });
  });
}

async function projectRecords(
  signal?: AbortSignal,
  options: ProjectionOptions = {},
): Promise<ProjectionResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const writeChunkSize = Math.max(
    1,
    Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, DEFAULT_WRITE_CHUNK_SIZE),
  );
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const retryMax = options.retryMax ?? DEFAULT_RETRY_MAX;
  let metadataRetries = 0;
  const checkpoint = (
    await withRetry(() => getOrCreateCheckpoint(), {
      retryMax,
      signal,
      onRetry: () => {
        metadataRetries++;
      },
    })
  ).value;
  const result: ProjectionResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    retried: metadataRetries,
    setToOpen: 0,
    setToClose: 0,
    protected: 0,
    checkpoint: {
      lastProjectedImportedAt: checkpoint.lastProjectedImportedAt,
      lastProjectedTicketRawId: checkpoint.lastProjectedTicketRawId,
      syncBatchId: checkpoint.lastSyncBatchId,
    },
    errors: [],
  };

  await prisma.ticket_projection_checkpoint.update({
    where: { name: CHECKPOINT_NAME },
    data: { status: 'running', startedAt: nowWib(), lastError: null },
  });

  await retryFailedProjectionItems(retryMax);

  await setMySQLSessionTimeout(30_000);

  try {
    resetVlookupCache();
    await refreshVlookupCache();
  } catch (error) {
    logger.warn('[Projection] Failed to warm up jenis_vlookup cache:', { error: String(error) });
  }

  if (concurrency > 1) {
    logger.info('[Projection] Projection concurrency ignored for transactional writes');
  }

  let hasMore = true;
  let activeCheckpoint: ProjectionCheckpoint =
    options.syncBatchId && checkpoint.lastSyncBatchId !== options.syncBatchId
      ? {
          lastProjectedImportedAt: null,
          lastProjectedTicketRawId: null,
          lastSyncBatchId: options.syncBatchId,
          neverProjectedCount: 0,
        }
      : options.preserveCheckpointCursor
        ? {
            lastProjectedImportedAt: null,
            lastProjectedTicketRawId: null,
            lastSyncBatchId: checkpoint.lastSyncBatchId,
            neverProjectedCount: 0,
          }
        : checkpoint;

  logger.info('[Projection] Starting:', { mode: options.mode ?? 'incremental', batchSize, writeChunkSize, cursor: `${activeCheckpoint.lastProjectedImportedAt?.toISOString() ?? '-'}:${activeCheckpoint.lastProjectedTicketRawId ?? '-'}` });

  while (hasMore) {
    assertNotAborted(signal);
    let fetchRetries = 0;
    const rawRecords = (
      await withRetry(() => fetchBatch(activeCheckpoint, { ...options, batchSize }), {
        retryMax,
        signal,
        onRetry: () => {
          fetchRetries++;
        },
      })
    ).value;
    result.retried += fetchRetries;
    assertNotAborted(signal);
    if (rawRecords.length === 0) break;

    const items = await prepareProjectionItems(rawRecords);
    assertNotAborted(signal);

    const lastRecord = rawRecords[rawRecords.length - 1]!;
    try {
    const itemChunks = chunkArray(items, writeChunkSize);
    for (const itemChunk of itemChunks) {
      const chunkLastRecord = itemChunk[itemChunk.length - 1]!.raw;
      const chunkStartMs = Date.now();
      let batchRetries = 0;
      const nextResult: ProjectionResult = {
          ...result,
          processed: result.processed + itemChunk.length,
          inserted:
            result.inserted +
            itemChunk.filter((item) => item.action === 'inserted').length,
          updated:
            result.updated +
            itemChunk.filter((item) => item.action === 'updated').length,
          skipped:
            result.skipped +
            itemChunk.filter((item) => item.action === 'skipped').length,
          protected:
            result.protected + itemChunk.filter((item) => item.protected).length,
          setToOpen:
            result.setToOpen +
            itemChunk.filter((item) => item.statusResolution?.statusUpdate === 'open')
              .length,
          setToClose:
            result.setToClose +
            itemChunk.filter((item) => item.statusResolution?.statusUpdate === 'close')
              .length,
        };

        await withRetry(
          () =>
            projectSubBatchAtomically(itemChunk, chunkLastRecord, nextResult, {
              attempts: batchRetries + 1,
              syncBatchId: options.syncBatchId ?? chunkLastRecord.syncBatchId,
              preserveCheckpointCursor:
                options.preserveCheckpointCursor === true,
              preservedCheckpoint: checkpoint,
              signal,
            }),
          {
            retryMax,
            signal,
            onRetry: () => {
              batchRetries++;
              nextResult.retried += itemChunk.length;
            },
          },
        );

        await prisma.ticket_projection_checkpoint.update({
          where: { name: CHECKPOINT_NAME },
          data: { heartbeatAt: nowWib() },
        });
        logger.info('[Projection] Sub-batch success:', { size: itemChunk.length, checkpoint: `${chunkLastRecord.importedAt?.toISOString() ?? '-'}:${chunkLastRecord.id_ticket}` });
        const batchDurationMs = Date.now() - chunkStartMs;
        const rowsPerSecond = batchDurationMs > 0
          ? Math.round((itemChunk.length / batchDurationMs) * 1000 * 100) / 100
          : 0;
        const chunkLagMs = chunkLastRecord.importedAt
          ? Date.now() - chunkLastRecord.importedAt.getTime()
          : null;

        await Promise.allSettled([
          recordProjectionMetric('lastBatchDurationMs', batchDurationMs),
          recordProjectionMetric('lastBatchRowsPerSecond', rowsPerSecond),
          recordProjectionMetric('lastBatchRows', itemChunk.length),
          chunkLagMs !== null
            ? recordProjectionMetric('pipelineLagMs', chunkLagMs)
            : Promise.resolve(),
          setProjectionStatus('running', {
            batchDurationMs,
            rowsPerSecond,
            lagMs: chunkLagMs ?? undefined,
            processed: nextResult.processed,
            inserted: nextResult.inserted,
            updated: nextResult.updated,
            skipped: nextResult.skipped,
            failed: nextResult.failed,
            retried: nextResult.retried,
            protected: nextResult.protected,
            checkpoint: `${chunkLastRecord.importedAt?.toISOString() ?? '-'}:${chunkLastRecord.id_ticket}`,
          }),
        ]);

        result.processed = nextResult.processed;
        result.inserted = nextResult.inserted;
        result.updated = nextResult.updated;
        result.skipped = nextResult.skipped;
        result.protected = nextResult.protected;
        result.setToOpen = nextResult.setToOpen;
        result.setToClose = nextResult.setToClose;
        result.retried = nextResult.retried;
        result.checkpoint = nextResult.checkpoint;
      }
    } catch (error) {
      const failedItems = items.filter((item) => {
        const checkpointImportedAt = result.checkpoint.lastProjectedImportedAt;
        const checkpointId = result.checkpoint.lastProjectedTicketRawId;
        if (!checkpointImportedAt || !checkpointId || !item.raw.importedAt) {
          return true;
        }
        return (
          item.raw.importedAt.getTime() > checkpointImportedAt.getTime() ||
          (item.raw.importedAt.getTime() === checkpointImportedAt.getTime() &&
            item.raw.id_ticket > checkpointId)
        );
      });
      for (const item of failedItems) {
        result.failed++;
        result.errors.push({
          incident: item.raw.incident ?? 'unknown',
          error: String(error),
        });
        await markProjectionFailure(item, error, retryMax + 1);
        await quarantine('projection', { itemId: item.raw.id_ticket, incident: item.raw.incident }, error).catch(() => {});
      }
      await prisma.ticket_projection_checkpoint.update({
        where: { name: CHECKPOINT_NAME },
        data: {
          status: 'failed',
          failed: result.failed,
          lastError: result.errors.at(-1)?.error ?? 'Projection batch failed',
          completedAt: nowWib(),
        },
      });
      throw new Error(
        `Projection batch failed with ${failedItems.length} failed record(s); checkpoint advanced only for successful sub-batches`,
      );
    }

    assertNotAborted(signal);
    activeCheckpoint = options.preserveCheckpointCursor
      ? {
          lastProjectedImportedAt: lastRecord.importedAt,
          lastProjectedTicketRawId: lastRecord.id_ticket,
          lastSyncBatchId: checkpoint.lastSyncBatchId,
          neverProjectedCount: 0,
        }
      : {
          lastProjectedImportedAt: lastRecord.importedAt,
          lastProjectedTicketRawId: lastRecord.id_ticket,
          lastSyncBatchId: options.syncBatchId ?? lastRecord.syncBatchId,
          neverProjectedCount: 0,
        };
    hasMore = rawRecords.length === batchSize;
    logger.info('[Projection] Batch result:', { checkpoint: `${activeCheckpoint.lastProjectedImportedAt?.toISOString() ?? '-'}:${activeCheckpoint.lastProjectedTicketRawId ?? '-'}`, processed: result.processed, inserted: result.inserted, updated: result.updated, skipped: result.skipped, failed: result.failed });
    assertNotAborted(signal);
  }

  await prisma.ticket_projection_checkpoint.update({
    where: { name: CHECKPOINT_NAME },
    data: { status: 'success', neverProjectedCount: 0, completedAt: nowWib() },
  });
  return result;
}

async function retryFailedProjectionItems(retryMax: number): Promise<void> {
  const failedLogs = await prisma.ticket_projection_log.findMany({
    where: { status: 'failed', attempts: { lt: retryMax } },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });
  if (failedLogs.length === 0) return;

  const ids = failedLogs.map((l) => l.id);
  await prisma.ticket_projection_log.updateMany({
    where: { id: { in: ids } },
    data: { attempts: { increment: 1 } },
  });
  logger.info('[Projection] DLQ retry: incremented retryCount; will be picked up by reconciliation guard', {
    count: failedLogs.length,
  });
}

function emptyProjectionResult(): ProjectionResult {
  return {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
    setToOpen: 0,
    setToClose: 0,
    protected: 0,
    checkpoint: {
      lastProjectedImportedAt: null,
      lastProjectedTicketRawId: null,
      syncBatchId: null,
    },
    errors: [],
  };
}

export async function runProjection(
  signal?: AbortSignal,
  options: ProjectionOptions = {},
): Promise<ProjectionResult> {
  await setProjectionStatus('running', {});
  const start = Date.now();

  if (process.env.PROJECTION_ENABLED !== 'true') {
    logger.info('[Projection] Disabled');
    await setProjectionStatus('success', { duration: Date.now() - start });
    return emptyProjectionResult();
  }

  try {
    assertNotAborted(signal);
    const result = await projectRecords(signal, options);
    result.duration = Date.now() - start;
    const endToEndLagMs = result.checkpoint.lastProjectedImportedAt
      ? Date.now() - result.checkpoint.lastProjectedImportedAt.getTime()
      : null;
    const rowsPerSecond = result.duration > 0
      ? Math.round((result.processed / result.duration) * 1000 * 100) / 100
      : 0;
    await Promise.allSettled([
      recordProjectionMetric('lastRunDurationMs', result.duration),
      recordProjectionMetric('lastRunRowsPerSecond', rowsPerSecond),
      endToEndLagMs !== null
        ? recordProjectionMetric('pipelineLagMs', endToEndLagMs)
        : Promise.resolve(),
    ]);
    const RECONCILIATION_TIMEOUT_MS = 10_000;
    const reconciliation = await Promise.race([
      getProjectionReconciliationReport(),
      new Promise<null>(resolve =>
        setTimeout(() => resolve(null), RECONCILIATION_TIMEOUT_MS),
      ),
    ]).catch(() => null);
    let finalReconciliation = reconciliation;
    let autoRepairError: unknown = null;

    if (
      !options.skipAutoRepair &&
      reconciliation &&
      reconciliation.neverProjectedRaw > 0
    ) {
      logger.warn('[Projection] Auto-repair triggered:', {
        neverProjectedRaw: reconciliation.neverProjectedRaw,
        oldestPending: reconciliation.oldestUnprojectedImportedAt?.toISOString(),
      });
      try {
        const {
          syncBatchId: _ignoredSyncBatchId,
          skipAutoRepair: _ignoredSkipAutoRepair,
          ...repairOptions
        } = options;
        await projectRecords(signal, {
          ...repairOptions,
          since: new Date(0),
          mode: 'full',
          preserveCheckpointCursor: true,
          batchSize: 200,
          skipAutoRepair: true,
        });
        logger.info('[Projection] Auto-repair complete');
      } catch (error) {
        autoRepairError = error;
        logger.error('[Projection] Auto-repair failed:', { error: String(error) });
      }

      finalReconciliation = await Promise.race([
        getProjectionReconciliationReport(),
        new Promise<null>(resolve =>
          setTimeout(() => resolve(null), RECONCILIATION_TIMEOUT_MS),
        ),
      ]).catch(() => finalReconciliation);
    }

    const projectionHealthy = reconciliation
      ? reconciliation.neverProjectedRaw === 0
        ? autoRepairError === null
        : autoRepairError === null &&
          finalReconciliation !== null &&
          finalReconciliation.neverProjectedRaw === 0
      : autoRepairError === null;

    await setProjectionStatus(projectionHealthy ? 'success' : 'failed', {
      duration: result.duration,
      lagMs: endToEndLagMs ?? undefined,
      rowsPerSecond,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      retried: result.retried,
      protected: result.protected,
      checkpoint:
        `${result.checkpoint.lastProjectedImportedAt?.toISOString() ?? '-'}:${result.checkpoint.lastProjectedTicketRawId ?? '-'}` +
        (finalReconciliation
          ? `|neverProjected=${finalReconciliation.neverProjectedRaw}|oldestPending=${finalReconciliation.oldestUnprojectedImportedAt?.toISOString() ?? '-'}`
          : ''),
    });

    if (result.processed === 0) {
      consecutiveZeroProcessed++;
      if (consecutiveZeroProcessed >= 3) {
        logger.warn('[Projection] Drift detected:', { consecutiveZeroProcessed });
        consecutiveZeroProcessed = 0;
      }
    } else {
      consecutiveZeroProcessed = 0;
    }

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    await setProjectionStatus('failed', { duration });
    if (String(err).includes('Projection aborted')) {
      await prisma.ticket_projection_checkpoint.upsert({
        where: { name: CHECKPOINT_NAME },
        create: {
          name: CHECKPOINT_NAME,
          status: 'aborted',
          lastError: 'Projection aborted',
          completedAt: nowWib(),
        },
        update: {
          status: 'aborted',
          lastError: 'Projection aborted',
          completedAt: nowWib(),
        },
      });
    }
    throw err;
  }
}

export async function runInitialProjection(
  signal?: AbortSignal,
): Promise<ProjectionResult> {
  logger.info('[Projection] Starting initial projection (full)...');
  await prisma.ticket_projection_checkpoint.upsert({
    where: { name: CHECKPOINT_NAME },
    create: { name: CHECKPOINT_NAME, status: 'idle' },
    update: {
      lastProjectedImportedAt: null,
      lastProjectedTicketRawId: null,
      lastSyncBatchId: null,
    },
  });
  return runProjection(signal, { mode: 'full' });
}

export async function runFullScanProjection(
  signal?: AbortSignal,
): Promise<ProjectionResult> {
  logger.info('[Projection] Starting full scan without resetting checkpoint...');
  return runProjection(signal, {
    mode: 'full',
    since: new Date(0),
    preserveCheckpointCursor: true,
  });
}

export async function runIncrementalProjection(
  signal?: AbortSignal,
): Promise<ProjectionResult> {
  logger.info('[Projection] Starting incremental projection from checkpoint...');
  return runProjection(signal, { mode: 'incremental' });
}

export async function getProjectionReconciliationReport(): Promise<{
  activeRaw: number;
  projectedRaw: number;
  neverProjectedRaw: number;
  failedRaw: number;
  tickets: number;
  oldestUnprojectedImportedAt: Date | null;
  checkpoint: ProjectionCheckpoint & { status?: string | null };
}> {
  const checkpoint = await prisma.ticket_projection_checkpoint.findUnique({
    where: { name: CHECKPOINT_NAME },
    select: {
      lastProjectedImportedAt: true,
      lastProjectedTicketRawId: true,
      lastSyncBatchId: true,
      status: true,
      neverProjectedCount: true,
    },
  });

  const neverProjectedRaw = checkpoint?.neverProjectedCount ?? 0;

  const [activeRaw, projectedRaw, failedRaw, tickets, oldestGapRows] =
    await Promise.all([
      prisma.ticket_raw.count({ where: { isActive: true } }),
      prisma.ticket_projection_log.count({ where: { status: 'success' } }),
      prisma.ticket_projection_log.count({ where: { status: 'failed' } }),
      prisma.ticket.count(),
      neverProjectedRaw > 0
        ? prisma.$queryRaw<Array<{ importedAt: Date | null }>>`
          SELECT tr.importedAt AS importedAt
          FROM ticket_raw tr
          WHERE tr.isActive = TRUE
            AND tr.importedAt IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM ticket_projection_log tpl
              WHERE tpl.ticketRawId = tr.id_ticket AND tpl.status = 'success'
            )
          ORDER BY tr.importedAt ASC, tr.id_ticket ASC
          LIMIT 1
        `
        : Promise.resolve([] as Array<{ importedAt: Date | null }>),
    ]);

  const oldestUnprojectedImportedAt = oldestGapRows[0]?.importedAt ?? null;

  return {
    activeRaw,
    projectedRaw,
    neverProjectedRaw,
    failedRaw,
    tickets,
    oldestUnprojectedImportedAt,
    checkpoint: checkpoint ?? {
      lastProjectedImportedAt: null,
      lastProjectedTicketRawId: null,
      lastSyncBatchId: null,
      status: null,
      neverProjectedCount: 0,
    },
  };
}

export async function backfillJenisTiket(
  batchSize: number = 100,
): Promise<{ processed: number; updated: number; errors: number }> {
  logger.info('[Backfill] Starting jenis_tiket vlookup backfill...');
  resetVlookupCache();
  await refreshVlookupCache();

  const result = { processed: 0, updated: 0, errors: 0 };
  let hasMore = true;
  let skip = 0;

  while (hasMore) {
    const tickets = await prisma.ticket.findMany({
      where: { OR: [{ jenis_tiket_1: null }, { jenis_tiket_2: null }] },
      select: {
        id_ticket: true,
        incident: true,
        channel: true,
        classification_path: true,
        customer_type: true,
        customer_segment: true,
        service_type: true,
        service_no: true,
        source_ticket: true,
        realm: true,
        summary: true,
      },
      take: batchSize,
      skip,
    });
    if (tickets.length === 0) break;

    const inputs = tickets.map((t) => ({
      channel: t.channel,
      classification_path: t.classification_path,
      customer_type: t.customer_type,
      customer_segment: t.customer_segment,
      service_type: t.service_type,
      service_no: t.service_no,
      source_ticket: t.source_ticket,
      realm: t.realm,
      summary: t.summary,
    }));

    const results = await batchClassifyJenisFromVlookup(inputs);

    for (let i = 0; i < tickets.length; i++) {
      try {
        const r = results[i];
        if (r && (r.jenis_tiket_1 || r.jenis_tiket_2)) {
          await prisma.ticket.update({
            where: { id_ticket: tickets[i]!.id_ticket },
            data: {
              jenis_tiket_1: r.jenis_tiket_1,
              jenis_tiket_2: r.jenis_tiket_2,
            },
          });
          result.updated++;
        }
        result.processed++;
      } catch (error) {
        logger.error('[Backfill] Error processing:', { incident: tickets[i]?.incident, error: String(error) });
        result.errors++;
      }
    }
    skip += batchSize;
    hasMore = tickets.length === batchSize;
  }

  logger.info('[Backfill] Complete:', { processed: result.processed, updated: result.updated, errors: result.errors });
  return result;
}
