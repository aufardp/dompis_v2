import { prisma } from '@/app/libs/prisma';
import type { Prisma } from '@prisma/client';
import { format, toZonedTime } from 'date-fns-tz';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import {
  batchClassifyJenisFromVlookup,
  resetVlookupCache,
  refreshVlookupCache,
} from '@/lib/classify-jenis-vlookup';
import { setProjectionStatus } from '@/lib/sync-metrics/metrics';
import { isTicketClosed, normalizeStatusUpdate } from '@/app/libs/ticket-utils';

const TIMEZONE = 'Asia/Jakarta';
const CHECKPOINT_NAME = 'ticket_raw_to_ticket';

const PROTECTED_STATES = new Set([
  'assigned',
  'on_progress',
  'pending',
  'close',
  'closed',
]);

const DEFAULT_BATCH_SIZE = parsePositiveIntEnv('PROJECTION_BATCH_SIZE', 500);
const DEFAULT_CONCURRENCY = parsePositiveIntEnv('PROJECTION_CONCURRENCY', 5);
const DEFAULT_RETRY_MAX = parsePositiveIntEnv('PROJECTION_RETRY_MAX', 3);
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

  const isExternalClosed = external === 'close' || external === 'closed';
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
}

interface ProjectionCheckpoint {
  lastProjectedImportedAt: Date | null;
  lastProjectedTicketRawId: string | null;
  lastSyncBatchId: string | null;
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
  synced_at: Date | null;
  import_batch: string | null;
  status_update: string | null;
  closed_at: Date | null;
  rca: string | null;
  sub_rca: string | null;
  status_manja: string | null;
  alamat: string | null;
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
  classification_path: 'classification_path',
  incident_domain: 'incident_domain',
  solution: 'solution',
  tsc_result: 'tsc_result',
  scc_result: 'scc_result',
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
  await Promise.all(workers);
}

async function getOrCreateCheckpoint(): Promise<ProjectionCheckpoint> {
  const row = await prisma.ticket_projection_checkpoint.upsert({
    where: { name: CHECKPOINT_NAME },
    create: { name: CHECKPOINT_NAME, status: 'idle' },
    update: {},
    select: {
      lastProjectedImportedAt: true,
      lastProjectedTicketRawId: true,
      lastSyncBatchId: true,
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

function shouldSkipProjection(
  raw: RawSelectResult,
  existing: ExistingTicket | undefined,
): boolean {
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
      classification_path: true,
      incident_domain: true,
      solution: true,
      tsc_result: true,
      scc_result: true,
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
      classification_path: r.classification_path as string | null,
      customer_type: r.customer_type as string | null,
      customer_segment: r.customer_segment as string | null,
      service_type: r.service_type as string | null,
      service_no: r.service_no as string | null,
      source_ticket: r.source_ticket as string | null,
      realm: r.realm as string | null,
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

  const now = nowWib();
  const syncDate = todayWibDateForDb();
  return validRawRecords.map((raw, index) => {
    const existing = existingMap.get(raw.incident!);
    const projection = buildProjectionUpsert(
      raw,
      existing,
      jenisResults[index]?.jenis_tiket_1 ?? null,
      jenisResults[index]?.jenis_tiket_2 ?? null,
      now,
      syncDate,
    );
    return {
      raw,
      ...projection,
      action: !existing
        ? 'inserted'
        : shouldSkipProjection(raw, existing)
          ? 'skipped'
          : 'updated',
    };
  });
}

async function projectOneItemInTransaction(
  tx: Prisma.TransactionClient,
  item: ProjectionItem,
  attempts: number,
): Promise<void> {
  if (item.action !== 'skipped') {
    await tx.ticket.upsert(item.upsert);
  }
  await tx.ticket_projection_log.upsert({
    where: { ticketRawId: item.raw.id_ticket },
    create: {
      ticketRawId: item.raw.id_ticket,
      incident: item.raw.incident!,
      syncBatchId: item.raw.syncBatchId,
      importedAt: item.raw.importedAt,
      action: item.action,
      status: 'success',
      attempts,
      sourceHash: item.raw.sourceHash,
      syncVersion: item.raw.syncVersion,
      projectedAt: nowWib(),
    },
    update: {
      syncBatchId: item.raw.syncBatchId,
      importedAt: item.raw.importedAt,
      action: item.action,
      status: 'success',
      attempts,
      error: null,
      sourceHash: item.raw.sourceHash,
      syncVersion: item.raw.syncVersion,
      projectedAt: nowWib(),
    },
  });
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
): Promise<void> {
  if (!lastRecord.importedAt) {
    throw new Error('Projection cursor requires importedAt on ticket_raw');
  }
  await tx.ticket_projection_checkpoint.update({
    where: { name: CHECKPOINT_NAME },
    data: {
      lastProjectedImportedAt: lastRecord.importedAt,
      lastProjectedTicketRawId: lastRecord.id_ticket,
      lastSyncBatchId: syncBatchId,
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
    lastProjectedImportedAt: lastRecord.importedAt,
    lastProjectedTicketRawId: lastRecord.id_ticket,
    syncBatchId,
  };
}

async function projectBatchAtomically(
  items: ProjectionItem[],
  lastRecord: RawSelectResult,
  result: ProjectionResult,
  options: {
    concurrency: number;
    attempts: number;
    syncBatchId: string | null;
    signal?: AbortSignal;
  },
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await runLimited(items, options.concurrency, async (item) => {
        assertNotAborted(options.signal);
        await projectOneItemInTransaction(tx, item, options.attempts);
      });
      await advanceCheckpoint(tx, lastRecord, result, options.syncBatchId);
    },
    { isolationLevel: 'ReadCommitted', timeout: 60_000 },
  );
}

async function projectRecords(
  signal?: AbortSignal,
  options: ProjectionOptions = {},
): Promise<ProjectionResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const retryMax = options.retryMax ?? DEFAULT_RETRY_MAX;
  const checkpoint = await getOrCreateCheckpoint();
  const result: ProjectionResult = {
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

  try {
    resetVlookupCache();
    await refreshVlookupCache();
  } catch (error) {
    console.warn('[Projection] Failed to warm up jenis_vlookup cache:', error);
  }

  let hasMore = true;
  let activeCheckpoint =
    options.syncBatchId && checkpoint.lastSyncBatchId !== options.syncBatchId
      ? {
          lastProjectedImportedAt: null,
          lastProjectedTicketRawId: null,
          lastSyncBatchId: options.syncBatchId,
        }
      : checkpoint;

  while (hasMore) {
    assertNotAborted(signal);
    const rawRecords = await fetchBatch(activeCheckpoint, { ...options, batchSize });
    assertNotAborted(signal);
    if (rawRecords.length === 0) break;

    const items = await prepareProjectionItems(rawRecords);
    assertNotAborted(signal);

    const lastRecord = rawRecords[rawRecords.length - 1]!;
    try {
      let batchRetries = 0;
      const nextResult: ProjectionResult = {
        ...result,
        processed: result.processed + items.length,
        inserted:
          result.inserted +
          items.filter((item) => item.action === 'inserted').length,
        updated:
          result.updated +
          items.filter((item) => item.action === 'updated').length,
        skipped:
          result.skipped +
          items.filter((item) => item.action === 'skipped').length,
        protected:
          result.protected + items.filter((item) => item.protected).length,
        setToOpen:
          result.setToOpen +
          items.filter((item) => item.statusResolution?.statusUpdate === 'open')
            .length,
        setToClose:
          result.setToClose +
          items.filter((item) => item.statusResolution?.statusUpdate === 'close')
            .length,
      };
      await withRetry(
        () =>
          projectBatchAtomically(items, lastRecord, nextResult, {
            concurrency,
            attempts: batchRetries + 1,
            syncBatchId: options.syncBatchId ?? lastRecord.syncBatchId,
            signal,
          }),
        {
          retryMax,
          signal,
          onRetry: () => {
            batchRetries++;
            nextResult.retried += items.length;
          },
        },
      );
      result.processed = nextResult.processed;
      result.inserted = nextResult.inserted;
      result.updated = nextResult.updated;
      result.skipped = nextResult.skipped;
      result.protected = nextResult.protected;
      result.setToOpen = nextResult.setToOpen;
      result.setToClose = nextResult.setToClose;
      result.retried = nextResult.retried;
      result.checkpoint = nextResult.checkpoint;
    } catch (error) {
      for (const item of items) {
        result.failed++;
        result.errors.push({
          incident: item.raw.incident ?? 'unknown',
          error: String(error),
        });
        await markProjectionFailure(item, error, retryMax + 1);
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
        `Projection batch failed with ${items.length} failed record(s); checkpoint not advanced`,
      );
    }

    assertNotAborted(signal);
    activeCheckpoint = {
      lastProjectedImportedAt: lastRecord.importedAt,
      lastProjectedTicketRawId: lastRecord.id_ticket,
      lastSyncBatchId: options.syncBatchId ?? lastRecord.syncBatchId,
    };
    hasMore = rawRecords.length === batchSize;
    console.log(
      `[Projection] checkpoint=${activeCheckpoint.lastProjectedImportedAt?.toISOString() ?? '-'}:${activeCheckpoint.lastProjectedTicketRawId ?? '-'} processed=${result.processed} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
    );
    assertNotAborted(signal);
  }

  await prisma.ticket_projection_checkpoint.update({
    where: { name: CHECKPOINT_NAME },
    data: { status: 'success', completedAt: nowWib() },
  });
  return result;
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
    console.log('[Projection] Disabled');
    await setProjectionStatus('success', { duration: Date.now() - start });
    return emptyProjectionResult();
  }

  try {
    assertNotAborted(signal);
    const result = await projectRecords(signal, options);
    result.duration = Date.now() - start;
    await setProjectionStatus('success', {
      duration: result.duration,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      retried: result.retried,
      protected: result.protected,
      checkpoint: `${result.checkpoint.lastProjectedImportedAt?.toISOString() ?? '-'}:${result.checkpoint.lastProjectedTicketRawId ?? '-'}`,
    });
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
  console.log('[Projection] Starting initial projection (full)...');
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
  console.log('[Projection] Starting full scan without resetting checkpoint...');
  return runProjection(signal, { mode: 'full', since: new Date(0) });
}

export async function runIncrementalProjection(
  signal?: AbortSignal,
): Promise<ProjectionResult> {
  console.log('[Projection] Starting incremental projection from checkpoint...');
  return runProjection(signal, { mode: 'incremental' });
}

export async function getProjectionReconciliationReport(): Promise<{
  activeRaw: number;
  projectedRaw: number;
  neverProjectedRaw: number;
  failedRaw: number;
  tickets: number;
  checkpoint: ProjectionCheckpoint & { status?: string | null };
}> {
  const [checkpoint, activeRaw, projectedRaw, failedRaw, tickets, gapRows] =
    await Promise.all([
      prisma.ticket_projection_checkpoint.findUnique({
        where: { name: CHECKPOINT_NAME },
        select: {
          lastProjectedImportedAt: true,
          lastProjectedTicketRawId: true,
          lastSyncBatchId: true,
          status: true,
        },
      }),
      prisma.ticket_raw.count({ where: { isActive: true } }),
      prisma.ticket_projection_log.count({ where: { status: 'success' } }),
      prisma.ticket_projection_log.count({ where: { status: 'failed' } }),
      prisma.ticket.count(),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM ticket_raw tr
        LEFT JOIN ticket_projection_log tpl
          ON tpl.ticketRawId = tr.id_ticket AND tpl.status = 'success'
        WHERE tr.isActive = TRUE
          AND tpl.id IS NULL
      `,
    ]);

  const neverProjectedRaw = Number(gapRows[0]?.count ?? 0);

  return {
    activeRaw,
    projectedRaw,
    neverProjectedRaw,
    failedRaw,
    tickets,
    checkpoint: checkpoint ?? {
      lastProjectedImportedAt: null,
      lastProjectedTicketRawId: null,
      lastSyncBatchId: null,
      status: null,
    },
  };
}

export async function backfillJenisTiket(
  batchSize: number = 100,
): Promise<{ processed: number; updated: number; errors: number }> {
  console.log('[Backfill] Starting jenis_tiket vlookup backfill...');
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
        console.error(
          `[Backfill] Error processing ${tickets[i]?.incident}:`,
          error,
        );
        result.errors++;
      }
    }
    skip += batchSize;
    hasMore = tickets.length === batchSize;
  }

  console.log(
    `[Backfill] Complete: ${result.processed} processed, ${result.updated} updated, ${result.errors} errors`,
  );
  return result;
}
