import { prisma } from '@/app/libs/prisma';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import { batchClassifyJenisFromVlookup } from '@/lib/classify-jenis-vlookup';
import {
  buildProjectionUpsert,
  shouldSkipProjection,
  type RawSelectResult,
  type ExistingTicket,
} from './index';

export type SingleProjectionResult = {
  action: 'inserted' | 'updated' | 'skipped';
  ticketId?: number;
  incident: string;
};

const RAW_SELECT_FIELDS = {
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
} as const;

const EXISTING_TICKET_SELECT_FIELDS = {
  id_ticket: true,
  incident: true,
  teknisi_user_id: true,
  description_solution_dompis: true,
  pending_dompis: true,
  pending_reason: true,
  synced_at: true,
  import_batch: true,
  status: true,
  status_update: true,
  closed_at: true,
  rca: true,
  sub_rca: true,
  status_manja: true,
  alamat: true,
  needs_validation: true,
  validation_reason: true,
} as const;

export async function projectSingleTicket(
  identifier: string,
): Promise<SingleProjectionResult> {
  const raw = await findRawRecord(identifier);
  if (!raw) {
    throw new Error(`ticket_raw tidak ditemukan untuk identifier: ${identifier}`);
  }
  if (!raw.incident) {
    throw new Error(`Record ticket_raw ${raw.id_ticket} tidak memiliki incident`);
  }

  const existing = await findExistingTicket(raw.incident);

  const now = nowWib();
  const syncDate = todayWibDateForDb();

  const jenisResult = await classifySingle(raw);

  const skip = shouldSkipProjection(raw, existing, undefined);
  if (skip) {
    return { action: 'skipped', incident: raw.incident };
  }

  const { upsert } = buildProjectionUpsert(
    raw,
    existing,
    jenisResult.jenis_tiket_1,
    jenisResult.jenis_tiket_2,
    now,
    syncDate,
  );

  const ticket = await prisma.ticket.upsert(upsert);

  await prisma.ticket_projection_log.upsert({
    where: { ticketRawId: raw.id_ticket },
    create: {
      ticketRawId: raw.id_ticket,
      incident: raw.incident,
      syncBatchId: raw.syncBatchId,
      importedAt: raw.importedAt,
      action: existing ? 'updated' : 'inserted',
      status: 'success',
      attempts: 1,
      sourceHash: raw.sourceHash,
      syncVersion: raw.syncVersion,
      projectedAt: now,
    },
    update: {
      action: existing ? 'updated' : 'inserted',
      status: 'success',
      attempts: { increment: 1 },
      sourceHash: raw.sourceHash,
      syncVersion: raw.syncVersion,
      projectedAt: now,
    },
  });

  return {
    action: existing ? 'updated' : 'inserted',
    ticketId: ticket.id_ticket,
    incident: raw.incident,
  };
}

async function findRawRecord(
  identifier: string,
): Promise<RawSelectResult | null> {
  return prisma.ticket_raw.findFirst({
    where: {
      OR: [{ incident: identifier }, { id_ticket: identifier }],
    },
    select: RAW_SELECT_FIELDS,
  }) as Promise<RawSelectResult | null>;
}

async function findExistingTicket(
  incident: string,
): Promise<ExistingTicket | undefined> {
  const ticket = await prisma.ticket.findUnique({
    where: { incident },
    select: EXISTING_TICKET_SELECT_FIELDS,
  });
  return ticket ?? undefined;
}

async function classifySingle(
  raw: RawSelectResult,
): Promise<{ jenis_tiket_1: string | null; jenis_tiket_2: string | null }> {
  const ext = raw.incident
    ? await prisma.ticket_raw_bridge_ext.findUnique({
        where: { incident: raw.incident },
        select: { c_description_serviceid: true },
      })
    : null;

  const results = await batchClassifyJenisFromVlookup([
    {
      channel: raw.channel as string | null,
      classification_flag: raw.classification_flag as string | null,
      classification_path: raw.classification_path as string | null,
      customer_type: raw.customer_type as string | null,
      customer_segment: raw.customer_segment as string | null,
      service_type: raw.service_type as string | null,
      service_no: raw.service_no as string | null,
      source_ticket: raw.source_ticket as string | null,
      realm: raw.realm as string | null,
      summary: raw.summary as string | null,
      symptom: raw.symptom as string | null,
      c_description_serviceid: ext?.c_description_serviceid ?? null,
    },
  ]);
  return results[0] ?? { jenis_tiket_1: null, jenis_tiket_2: null };
}
