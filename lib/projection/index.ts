import { prisma } from '@/app/libs/prisma';
import type { Prisma } from '@prisma/client';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import {
  classifyJenisFromVlookup,
  batchClassifyJenisFromVlookup,
  resetVlookupCache,
  refreshVlookupCache,
} from '@/lib/classify-jenis-vlookup';
import { setProjectionStatus } from '@/lib/sync-metrics/metrics';
import { isTicketClosed } from '@/app/libs/ticket-utils';

const PROTECTED_STATES = new Set([
  'assigned',
  'on_progress',
  'pending',
  'close',
  'closed',
]);

export function computeFlaggingManja(
  bookingDate: string | null,
): string | null {
  if (!bookingDate) return null;

  const booking = new Date(bookingDate);
  if (isNaN(booking.getTime())) return null;

  const now = nowWib();
  const bookingDateStr = booking.toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];
  const wibHour = booking.getUTCHours() + 7;

  if (bookingDateStr === todayStr && wibHour <= 15) {
    return 'P1';
  }

  if (bookingDateStr < todayStr) {
    return 'P1';
  }

  return 'P+';
}

export interface StatusUpdateResolution {
  statusUpdate?: string;
  closedAt?: Date;
}

export function resolveProjectionStatusUpdate(
  currentStatusUpdate: string | null,
  externalStatus: string | null,
  teknisiUserId: number | null,
): StatusUpdateResolution | null {
  const current = (currentStatusUpdate ?? '').trim().toLowerCase();
  const external = (externalStatus ?? '').trim().toLowerCase();

  if (current && PROTECTED_STATES.has(current)) {
    return null;
  }

  const isExternalClosed = external === 'close' || external === 'closed';
  const isUnassigned = !teknisiUserId;

  if (isExternalClosed && isUnassigned) {
    return { statusUpdate: 'close', closedAt: nowWib() };
  }

  if (isUnassigned && !isTicketClosed(current)) {
    if (current === 'open') {
      return null;
    }
    return { statusUpdate: 'open' };
  }

  return null;
}

const DEFAULT_BATCH_SIZE = parseInt(
  process.env.PROJECTION_BATCH_SIZE || '500',
  10,
);
const PARALLEL_UPSERT = 50;

interface ProjectionResult {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  setToOpen: number;
  setToClose: number;
  protected: number;
  errors: Array<{ incident: string; error: string }>;
}

interface ProjectionOptions {
  batchSize?: number;
  since?: Date;
  syncBatchId?: string;
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
  'rca',
  'sub_rca',
  'status_manja',
  'description_solution_dompis',
]);

interface RawSelectResult {
  id_ticket: string;
  incident: string | null;
  sourceTable: string | null;
  syncVersion: number;
  status: string | null;
  importedAt: Date | null;
  syncBatchId: string | null;
  [key: string]: unknown;
}

interface ExistingTicket {
  id_ticket: number;
  teknisi_user_id: number | null;
  description_solution_dompis: string | null;
  pending_dompis: string | null;
  synced_at: Date | null;
  status_update: string | null;
  closed_at: Date | null;
}

function buildProjectionUpsert(
  raw: RawSelectResult,
  existing: ExistingTicket | undefined,
  jenisTiket1: string | null,
  jenisTiket2: string | null,
  now: Date,
  syncDate: Date,
) {
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
  if (existing?.teknisi_user_id) {
    updateData.teknisi_user_id = existing.teknisi_user_id;
  }
  if (existing?.description_solution_dompis) {
    delete updateData.description_solution_dompis;
  }
  if (existing?.teknisi_user_id) {
    delete updateData.alamat;
  }

  const resolution = resolveProjectionStatusUpdate(
    existing?.status_update ?? null,
    raw.status ?? null,
    existing?.teknisi_user_id ?? null,
  );
  if (resolution) {
    if (resolution.statusUpdate !== undefined) {
      updateData.status_update = resolution.statusUpdate;
    }
    if (resolution.closedAt !== undefined) {
      updateData.closed_at = resolution.closedAt;
    }
  }

  const newFlagging = computeFlaggingManja(raw.booking_date as string | null);
  if (newFlagging) {
    updateData.flagging_manja = newFlagging;
  }

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
    createData['status_update'] = createResolution.statusUpdate;
    if (createResolution.closedAt) {
      createData['closed_at'] = createResolution.closedAt;
    }
  } else {
    createData['status_update'] = 'open';
  }

  const createFlagging = computeFlaggingManja(
    raw.booking_date as string | null,
  );
  createData['flagging_manja'] = createFlagging;

  return {
    where: { incident: raw.incident! },
    create: createData,
    update: updateData,
  };
}

async function projectRecords(
  options: ProjectionOptions = {},
): Promise<ProjectionResult> {
  const { batchSize = DEFAULT_BATCH_SIZE, since, syncBatchId } = options;
  const result: ProjectionResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    setToOpen: 0,
    setToClose: 0,
    protected: 0,
    errors: [],
  };

  console.log('[Projection] Starting projection...');

  try {
    resetVlookupCache();
    await refreshVlookupCache();
    console.log('[Projection] JenisVlookup cache warmed up');
  } catch (error) {
    console.warn('[Projection] Failed to warm up jenis_vlookup cache:', error);
  }

  const sinceDate = since ?? new Date(0);

  let cursor: { importedAt: Date; idTicket: string } | null = null;
  let hasMore = true;

  while (hasMore) {
    const where: Prisma.ticket_rawWhereInput = {
      isActive: true,
      ...(syncBatchId
        ? { syncBatchId }
        : { importedAt: { gte: sinceDate } }),
      ...(cursor
        ? {
            OR: [
              { importedAt: { gt: cursor.importedAt } },
              {
                importedAt: cursor.importedAt,
                id_ticket: { gt: cursor.idTicket },
              },
            ],
          }
        : {}),
    };

    const rawRecords = await prisma.ticket_raw.findMany({
      where,
      take: batchSize,
      orderBy: [{ importedAt: 'asc' }, { id_ticket: 'asc' }],
      select: {
        id_ticket: true,
        incident: true,
        sourceTable: true,
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
    });

    if (rawRecords.length === 0) break;

    const jenisResults = await batchClassifyJenisFromVlookup(
      rawRecords.map((r) => ({
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

    const jenisTiket1Map = new Map<string, string | null>();
    const jenisTiket2Map = new Map<string, string | null>();
    for (let i = 0; i < rawRecords.length; i++) {
      const incident = rawRecords[i]?.incident;
      if (incident) {
        jenisTiket1Map.set(incident, jenisResults[i]?.jenis_tiket_1 ?? null);
        jenisTiket2Map.set(incident, jenisResults[i]?.jenis_tiket_2 ?? null);
      }
    }

    const incidents = rawRecords
      .map((r) => r.incident)
      .filter(Boolean) as string[];
    const existingTickets = await prisma.ticket.findMany({
      where: { incident: { in: incidents } },
      select: {
        id_ticket: true,
        incident: true,
        teknisi_user_id: true,
        description_solution_dompis: true,
        pending_dompis: true,
        synced_at: true,
        status_update: true,
        closed_at: true,
      },
    });
    const existingMap = new Map(existingTickets.map((t) => [t.incident, t]));

    const now = nowWib();
    const syncDate = todayWibDateForDb();
    const upsertItems = rawRecords
      .filter((r) => r.incident)
      .map((raw) => ({
        raw,
        upsert: buildProjectionUpsert(
          raw as RawSelectResult,
          existingMap.get(raw.incident!),
          jenisTiket1Map.get(raw.incident!) ?? null,
          jenisTiket2Map.get(raw.incident!) ?? null,
          now,
          syncDate,
        ),
      }));

    for (let i = 0; i < upsertItems.length; i += PARALLEL_UPSERT) {
      const chunk = upsertItems.slice(i, i + PARALLEL_UPSERT);
      const results = await Promise.allSettled(
        chunk.map((item) =>
          prisma.ticket.upsert(
            item.upsert as Parameters<typeof prisma.ticket.upsert>[0],
          ),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const rawRecord = chunk[j]!.raw;
        const incident = rawRecord.incident ?? 'unknown';
        if (r.status === 'fulfilled') {
          result.processed++;
          const existing = existingMap.get(incident);
          if (!existing) result.inserted++;
          else {
            const shouldUpdate = existing.synced_at
              ? rawRecord.importedAt
                ? new Date(rawRecord.importedAt) > existing.synced_at
                : true
              : true;
            if (shouldUpdate) result.updated++;
            else result.skipped++;
          }
          const resolution = resolveProjectionStatusUpdate(
            existing?.status_update ?? null,
            rawRecord.status ?? null,
            existing?.teknisi_user_id ?? null,
          );
          if (resolution) {
            if (resolution.statusUpdate === 'open') result.setToOpen++;
            else if (resolution.statusUpdate === 'close') result.setToClose++;
          } else {
            result.protected++;
          }
        } else {
          result.failed++;
          result.errors.push({ incident, error: String(r.reason) });
        }
      }
    }

    const lastRecord = rawRecords[rawRecords.length - 1];
    if (!lastRecord?.importedAt) {
      throw new Error('Projection cursor requires importedAt on ticket_raw');
    }
    cursor = {
      importedAt: lastRecord.importedAt,
      idTicket: lastRecord.id_ticket,
    };
    hasMore = rawRecords.length === batchSize;
    console.log(`[Projection] Progress: ${result.processed} processed`);
  }

  return result;
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
    return {
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      setToOpen: 0,
      setToClose: 0,
      protected: 0,
      errors: [],
    };
  }

  try {
    const result = await projectRecords(options);
    const duration = Date.now() - start;
    console.log(
      `[Projection] Complete: inserted: ${result.inserted} | updated: ${result.updated} | skipped: ${result.skipped} | failed: ${result.failed} | setToOpen: ${result.setToOpen} | setToClose: ${result.setToClose} | protected: ${result.protected}`,
    );
    await setProjectionStatus('success', {
      duration,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
    });
    return result;
  } catch (err) {
    await setProjectionStatus('failed', { duration: Date.now() - start });
    throw err;
  }
}

export async function runInitialProjection(
  signal?: AbortSignal,
): Promise<ProjectionResult> {
  console.log('[Projection] Starting initial projection (full)...');
  return projectRecords({});
}

export async function runIncrementalProjection(
  signal?: AbortSignal,
): Promise<ProjectionResult> {
  console.log('[Projection] Starting incremental projection...');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return projectRecords({ since: oneHourAgo });
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
