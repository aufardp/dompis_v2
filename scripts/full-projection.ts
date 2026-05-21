/**
 * Full Projection Script - 100% Data Completeness
 *
 * Memproyeksikan SEMUA data dari ticket_raw ke ticket tanpa batasan waktu.
 * Menyalin semua field termasuk channel, classification_path, jenis_tiket, dll.
 *
 * Usage: npx tsx scripts/full-projection.ts
 */

import 'dotenv/config';
import { prisma } from '@/app/libs/prisma';
import {
  batchClassifyJenisFromVlookup,
  resetVlookupCache,
  refreshVlookupCache,
} from '@/lib/classify-jenis-vlookup';
import {
  computeFlaggingManja,
  resolveProjectionStatusUpdate,
} from '@/lib/projection';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';

const BATCH_SIZE = 500;
const PARALLEL_UPSERT = 50;

interface RawRecord {
  id_ticket: string;
  incident: string | null;
  sourceTable: string | null;
  syncVersion: number;
  status: string | null;
  importedAt: Date | null;
  syncBatchId: string | null;
  summary: string | null;
  reported_date: string | null;
  owner_group: string | null;
  customer_segment: string | null;
  service_type: string | null;
  workzone: string | null;
  ticket_id_gamas: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  booking_date: string | null;
  source_ticket: string | null;
  customer_type: string | null;
  customer_name: string | null;
  service_no: string | null;
  symptom: string | null;
  description_actual_solution: string | null;
  device_name: string | null;
  rk_information: string | null;
  witel: string | null;
  worklog_summary: string | null;
  realm: string | null;
  sn_ont: string | null;
  tipe_ont: string | null;
  guarantee_status: string | null;
  lapul: string | null;
  gaul: string | null;
  onu_rx: string | null;
  street_address: string | null;
  channel: string | null;
  classification_path: string | null;
  incident_domain: string | null;
  solution: string | null;
  tsc_result: string | null;
  scc_result: string | null;
  pending_reason: string | null;
  status_date: string | null;
}

interface ExistingTicket {
  id_ticket: number;
  incident: string;
  teknisi_user_id: number | null;
  description_solution_dompis: string | null;
  pending_dompis: string | null;
  synced_at: Date | null;
  status_update: string | null;
  closed_at: Date | null;
}

function buildUpsertData(
  raw: RawRecord,
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
    channel: raw.channel,
    classification_path: raw.classification_path,
    incident_domain: raw.incident_domain,
    solution: raw.solution,
    tsc_result: raw.tsc_result,
    scc_result: raw.scc_result,
    pending_reason: raw.pending_reason,
    jenis_tiket_1: jenisTiket1,
    jenis_tiket_2: jenisTiket2,
    status: raw.status,
    status_date: raw.status_date,
  };

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

  const createFlagging = computeFlaggingManja(raw.booking_date as string | null);
  createData['flagging_manja'] = createFlagging;

  return {
    where: { incident: raw.incident! },
    create: createData,
    update: updateData,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  FULL PROJECTION - 100% DATA COMPLETENESS');
  console.log('═══════════════════════════════════════════\n');

  const start = Date.now();

  const rawCount = await prisma.ticket_raw.count({
    where: { isActive: true },
  });
  const ticketCount = await prisma.ticket.count();

  console.log(`[1] ticket_raw (active): ${rawCount}`);
  console.log(`[2] ticket (existing):   ${ticketCount}\n`);

  resetVlookupCache();
  await refreshVlookupCache();
  console.log('[3] Vlookup cache warmed up\n');

  console.log('[4] Starting full projection...\n');

  let skip = 0;
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: Array<{ incident: string; error: string }> = [];

  while (true) {
    const rawRecords = await prisma.ticket_raw.findMany({
      where: { isActive: true },
      take: BATCH_SIZE,
      skip,
      orderBy: { importedAt: 'asc' },
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
        pending_reason: true,
        status_date: true,
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

    const incidents = rawRecords.map((r) => r.incident).filter(Boolean) as string[];
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
    const upserts = rawRecords
      .filter((r) => r.incident)
      .map((r, idx) =>
        buildUpsertData(
          r as RawRecord,
          existingMap.get(r.incident!),
          jenisResults[idx]?.jenis_tiket_1 ?? null,
          jenisResults[idx]?.jenis_tiket_2 ?? null,
          now,
          syncDate,
        ),
      );

    for (let i = 0; i < upserts.length; i += PARALLEL_UPSERT) {
      const chunk = upserts.slice(i, i + PARALLEL_UPSERT);
      const results = await Promise.allSettled(
        chunk.map((u) =>
          prisma.ticket.upsert(u as Parameters<typeof prisma.ticket.upsert>[0]),
        ),
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const incident = rawRecords[i + j]?.incident ?? 'unknown';
        if (r.status === 'fulfilled') {
          processed++;
          const existing = existingMap.get(incident);
          if (!existing) inserted++;
          else updated++;
        } else {
          errors++;
          errorDetails.push({ incident, error: String(r.reason) });
        }
      }
    }

    skip += BATCH_SIZE;

    if (processed % 5000 === 0 || rawRecords.length < BATCH_SIZE) {
      const pct = ((skip / rawCount) * 100).toFixed(1);
      console.log(
        `[Progress] ${processed}/${rawCount} (${pct}%) | inserted: ${inserted} | updated: ${updated} | errors: ${errors}`,
      );
    }
  }

  const duration = Date.now() - start;

  console.log('\n═══════════════════════════════════════════');
  console.log('  FULL PROJECTION RESULT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Duration:   ${duration}ms`);
  console.log(`  Processed:  ${processed}`);
  console.log(`  Inserted:   ${inserted}`);
  console.log(`  Updated:    ${updated}`);
  console.log(`  Errors:     ${errors}`);
  if (errorDetails.length > 0) {
    console.log(`  Sample errors:`);
    errorDetails.slice(0, 5).forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.incident}: ${e.error}`);
    });
  }
  console.log('═══════════════════════════════════════════\n');

  console.log('[5] Validation...\n');

  const finalTicketCount = await prisma.ticket.count();
  const nullChannel = await prisma.ticket.count({
    where: { channel: null },
  });
  const nullClassification = await prisma.ticket.count({
    where: { classification_path: null },
  });
  const nullJenis1 = await prisma.ticket.count({
    where: { jenis_tiket_1: null },
  });
  const nullJenis2 = await prisma.ticket.count({
    where: { jenis_tiket_2: null },
  });

  console.log(`  Final ticket count:         ${finalTicketCount}`);
  console.log(`  channel null:               ${nullChannel} (${((nullChannel / finalTicketCount) * 100).toFixed(1)}%)`);
  console.log(`  classification_path null:   ${nullClassification} (${((nullClassification / finalTicketCount) * 100).toFixed(1)}%)`);
  console.log(`  jenis_tiket_1 null:         ${nullJenis1} (${((nullJenis1 / finalTicketCount) * 100).toFixed(1)}%)`);
  console.log(`  jenis_tiket_2 null:         ${nullJenis2} (${((nullJenis2 / finalTicketCount) * 100).toFixed(1)}%)\n`);

  const samples = await prisma.ticket.findMany({
    take: 3,
    orderBy: { synced_at: 'desc' },
    select: {
      incident: true,
      channel: true,
      classification_path: true,
      jenis_tiket_1: true,
      jenis_tiket_2: true,
      synced_at: true,
    },
  });

  console.log('  Sample records:');
  samples.forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.incident}`);
    console.log(`       channel: ${s.channel || '(null)'}`);
    console.log(`       classification_path: ${s.classification_path || '(null)'}`);
    console.log(`       jenis_tiket_1: ${s.jenis_tiket_1 || '(null)'}`);
    console.log(`       jenis_tiket_2: ${s.jenis_tiket_2 || '(null)'}`);
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
