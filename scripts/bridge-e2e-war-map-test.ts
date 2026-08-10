/**
 * E2E Test: QOSMIC Bridge → ticket_raw → projection → ticket → War Map (bucket Customer).
 *
 * Alur (one-shot, in-process — TIDAK butuh worker):
 *  1. Ambil 10 data dari bridge (`iterateNossaOpen`, limit 10).
 *  2. Isi alamat (street_address) jika kosong (fallback Surabaya).
 *  3. `processRawRows` → upsert `ticket_raw` dengan syncBatchId=batchId.
 *  4. `runProjection({ syncBatchId, preserveCheckpointCursor })` → hanya batch kita.
 *  5. Cek predikat bucket Customer hari ini (sama seperti war-map points route).
 *  6. Geotag `service_location` untuk service_no yang belum punya titik.
 *  7. Verifikasi + ringkasan.
 *
 * Usage: npx tsx scripts/bridge-e2e-war-map-test.ts
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { waitForRedisReady } from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';
import { isQosmicBridgeConfigured } from '@/lib/external-db/qosmic-bridge/client';
import { iterateNossaOpen } from '@/lib/external-db/qosmic-bridge/nossa';
import type { QosmicRawRow } from '@/lib/external-db/qosmic-bridge/types';
import { processRawRows, type ChunkResult } from '@/lib/ingestion';
import { runProjection } from '@/lib/projection';
import type { ExternalCursorDefinition } from '@/lib/external-db/connection';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { buildOperationalBucketWhere } from '@/app/libs/services/ticket-buckets';
import { todayWibDateForDb } from '@/lib/timezone';

const FETCH_LIMIT = 10;

const DEMO_COORDS: Array<{ lat: number; lng: number; workzone: string; alamat: string }> = [
  { lat: -7.2565, lng: 112.7508, workzone: 'GBG', alamat: 'Jl. Pemuda No. 45, Surabaya' },
  { lat: -7.2578, lng: 112.7383, workzone: 'GBG', alamat: 'Jl. Tunjungan No. 12, Surabaya' },
  { lat: -7.2589, lng: 112.7512, workzone: 'JGR', alamat: 'Jl. Basuki Rahmad No. 88, Surabaya' },
  { lat: -7.2801, lng: 112.7718, workzone: 'GBG', alamat: 'Jl. Gubeng Kertajaya No. 7, Surabaya' },
  { lat: -7.2947, lng: 112.7327, workzone: 'DMO', alamat: 'Jl. Darmo No. 120, Surabaya' },
  { lat: -7.2695, lng: 112.7918, workzone: 'KJR', alamat: 'Jl. Raya Kenjeran No. 22, Surabaya' },
  { lat: -7.3301, lng: 112.7693, workzone: 'RKT', alamat: 'Jl. Rungkut Industri No. 9, Surabaya' },
  { lat: -7.2638, lng: 112.6861, workzone: 'TNS', alamat: 'Jl. Raya Bambe No. 31, Surabaya' },
  { lat: -7.2541, lng: 112.7128, workzone: 'KNN', alamat: 'Jl. Raya Kandangan No. 14, Surabaya' },
  { lat: -7.2701, lng: 112.7201, workzone: 'MYR', alamat: 'Jl. Manyar Sawahan No. 3, Surabaya' },
];

const SNAPSHOT_CURSOR: ExternalCursorDefinition = {
  idColumn: null,
  modifiedColumn: null,
  createdAtColumn: null,
  strategy: 'snapshot',
  columns: [],
};

function rawField(row: QosmicRawRow, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function ensureAlamat(row: QosmicRawRow, idx: number): QosmicRawRow {
  const address = rawField(row, ['street_address', 'C_STREET_ADDRESS', 'Alamat', 'Address']);
  if (address) return row;
  return { ...row, street_address: DEMO_COORDS[idx % DEMO_COORDS.length].alamat };
}

function makeBatchId(): string {
  return `bridge-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyResult(): ChunkResult {
  return {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    retried: 0,
    errors: [],
  };
}

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  E2E TEST: QOSMIC Bridge → ticket_raw → ticket → War Map');
  console.log(`  WIB today: ${todayWibDateForDb().toISOString().slice(0, 10)}\n`);
  '';

  if (!isQosmicBridgeConfigured()) {
    console.error('❌ QOSMIC Bridge belum dikonfigurasi. Set QOSMIC_BRIDGE_ENABLED/BASE_URL/TOKEN.');
    process.exit(1);
  }

  await waitForRedisReady(5_000);
  console.log('✅ Redis ready\n');

  // ── 1. Ambil data dari bridge ─────────────────────────────
  console.log(`[1] Fetch hingga ${FETCH_LIMIT} dari bridge (nossa/open), preferensi source_ticket=CUSTOMER...\n`);
  const fetched: QosmicRawRow[] = [];
  for await (const page of iterateNossaOpen({ limit: FETCH_LIMIT })) {
    fetched.push(...page);
    // Cukup sampai terkumpul 2x limit untuk filtering (ambil yg CUSTOMER dulu).
    if (fetched.length >= FETCH_LIMIT * 3) break;
  }

  const isCustomerRow = (r: QosmicRawRow) => {
    const src = rawField(r, ['Source', 'source_ticket', 'Source_Ticket', 'C_SOURCE_TICKET']);
    return src ? src.trim().toUpperCase() === 'CUSTOMER' : false;
  };

  const customerRows = fetched.filter(isCustomerRow);
  const rows = customerRows.length >= FETCH_LIMIT
    ? customerRows.slice(0, FETCH_LIMIT)
    : [...customerRows, ...fetched.filter((r) => !isCustomerRow(r))].slice(0, FETCH_LIMIT);

  if (rows.length === 0) {
    console.error('❌ Tidak ada data dari bridge (nossa open).');
    process.exit(1);
  }
  console.log(`  Fetched pool: ${fetched.length} rows | pilih CUSTOMER dulu: ${rows.length}`);
  rows.forEach((r, i) => {
    const incident = rawField(r, ['Incident', 'incident']) ?? '?';
    const serviceNo = rawField(r, ['Service_No', 'service_no', 'Service_Number']) ?? '(none)';
    const src = rawField(r, ['Source', 'source_ticket', 'Source_Ticket', 'C_SOURCE_TICKET']) ?? '(none)';
    console.log(`    ${i + 1}. ${incident} | service_no=${serviceNo} | source=${src}`);
  });
  console.log();

  // ── 2. Isi alamat jika kosong + insert ke ticket_raw ─────
  const batchId = makeBatchId();
  console.log(`[2] processRawRows → ticket_raw (batchId=${batchId})...\n`);
  const enriched = rows.map((r, i) => ensureAlamat(r, i));
  const ingestResult = emptyResult();
  await processRawRows(enriched, 'nossa', batchId, SNAPSHOT_CURSOR, ingestResult);
  console.log(
    `  processed=${ingestResult.processed} inserted=${ingestResult.inserted} updated=${ingestResult.updated} skipped=${ingestResult.skipped} failed=${ingestResult.failed} quarantined=${ingestResult.quarantined}`,
  );
  if (ingestResult.errors.length > 0) {
    console.log('  errors:');
    ingestResult.errors.slice(0, 5).forEach((e) => console.log(`    - ${e.incident}: ${e.error}`));
  }
  console.log();

  // ── 3. Projection → ticket (hanya batch kita) ─────────────
  console.log('[3] runProjection (syncBatchId scoped, preserve checkpoint)...\n');
  const proj = await runProjection(undefined, {
    syncBatchId: batchId,
    preserveCheckpointCursor: true,
    skipAutoRepair: true,
  });
  console.log(
    `  processed=${proj.processed} inserted=${proj.inserted} updated=${proj.updated} skipped=${proj.skipped} failed=${proj.failed} protected=${proj.protected}`,
  );
  console.log();

  // ── 4. Cek bucket Customer hari ini ───────────────────────
  console.log('[4] Predikat bucket Customer hari ini (legacy daily + kpi_customer)...\n');
  const incidents = enriched
    .map((r) => rawField(r, ['Incident', 'incident']))
    .filter((v): v is string => Boolean(v));

  const projectedTickets = await prisma.ticket.findMany({
    where: { incident: { in: incidents } },
    select: {
      id_ticket: true,
      incident: true,
      service_no: true,
      customer_name: true,
      jenis_tiket_1: true,
      jenis_tiket_2: true,
      source_ticket: true,
      classification_path: true,
      status: true,
      status_update: true,
      sync_date: true,
      alamat: true,
      workzone: true,
    },
  });

  const inBucket: typeof projectedTickets = [];
  for (const t of projectedTickets) {
    const where: Record<string, any> = {};
    await DailyTicketService.applyDailyTicketFilter(where, undefined, true);
    const candidate = {
      AND: [
        ...(where.AND ?? []),
        buildOperationalBucketWhere('kpi_customer') as Prisma.ticketWhereInput,
        { incident: t.incident },
      ],
    };
    const match = await prisma.ticket.findFirst({ where: candidate, select: { id_ticket: true } });
    const ok = Boolean(match);
    const reason = ok
      ? 'MASUK BUCKET'
      : t.classification_path === 'Z_PERMINTAAN_044'
        ? 'exclude: PERMINTAAN'
        : 'exclude: jenis/source tidak cocok customer';
    console.log(`  ${ok ? '✅' : '❌'} ${t.incident} | jenis1=${t.jenis_tiket_1 ?? 'null'} jenis2=${t.jenis_tiket_2 ?? 'null'} src=${t.source_ticket ?? 'null'} → ${reason}`);
    if (ok) inBucket.push(t);
  }
  console.log(`\n  Total masuk bucket customer: ${inBucket.length}/${projectedTickets.length}\n`);

  // ── 5. Geotag service_location ────────────────────────────
  console.log('[5] Geotag service_location (jika belum ada titik)...\n');
  let created = 0;
  let existing = 0;
  let coordIdx = 0;
  for (const t of inBucket) {
    if (!t.service_no) continue;
    const loc = await prisma.service_location.findUnique({
      where: { service_no: t.service_no },
    });
    if (loc) {
      existing++;
      console.log(`  • ${t.incident} → ${t.service_no}: sudah ada titik, dilewati`);
      continue;
    }
    const coord = DEMO_COORDS[coordIdx % DEMO_COORDS.length];
    coordIdx++;
    await prisma.service_location.create({
      data: {
        service_no: t.service_no,
        customer_name: t.customer_name,
        alamat: t.alamat ?? coord.alamat,
        latitude: new Prisma.Decimal(coord.lat.toFixed(7)),
        longitude: new Prisma.Decimal(coord.lng.toFixed(7)),
        accuracy_meters: new Prisma.Decimal((8 + (coordIdx % 10)).toFixed(2)),
        device_name: `ODP-${coord.workzone}-E2E/${String(coordIdx).padStart(2, '0')}`,
        barcode_dc: `BCR-${coord.workzone}-${String(coordIdx).padStart(2, '0')}`,
        workzone: t.workzone ?? coord.workzone,
        last_ticket_id: t.id_ticket,
        last_teknisi_id: null,
        tagged_count: 1,
      },
    });
    created++;
    console.log(`  ✅ ${t.incident} → ${t.service_no}: service_location dibuat (geo demo)`);
  }
  console.log(`\n  Geotag: ${created} dibuat, ${existing} sudah ada\n`);

  // ── 6. Verifikasi ─────────────────────────────────────────
  console.log('[6] Verifikasi: service_no yang akan tampil di war map (bucket=Customer)...\n');
  const dailyWhere: Record<string, any> = {};
  await DailyTicketService.applyDailyTicketFilter(dailyWhere, undefined, true);
  const bucketRows = await prisma.ticket.findMany({
    where: {
      AND: [
        ...(dailyWhere.AND ?? []),
        buildOperationalBucketWhere('kpi_customer') as Prisma.ticketWhereInput,
        { service_no: { not: null } },
      ],
    },
    select: { service_no: true },
    distinct: ['service_no'],
    take: 20000,
  });
  const bucketNos = new Set(
    bucketRows.map((r) => r.service_no).filter((v): v is string => Boolean(v && v.trim() !== '')),
  );

  const located = await prisma.service_location.findMany({
    where: { service_no: { in: [...bucketNos] } },
    select: { service_no: true, latitude: true, longitude: true },
  });

  let shown = 0;
  for (const l of located) {
    const inc = projectedTickets.find((t) => t.service_no === l.service_no)?.incident ?? '?';
    console.log(`  🗺️  ${inc} → ${l.service_no} (${l.latitude.toNumber()}, ${l.longitude.toNumber()})`);
    shown++;
  }
  console.log(
    `\n  ${shown} titik di bucket customer hari ini siap tampil di war map (total titik dgn sisi service_location di bucket: ${located.length}).`,
  );
  console.log('\n  Buka /admin/tools/war-map → filter Bucket=Customer, status bebas.');

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  RINGKASAN');
  console.log('  ─────────');
  console.log(`  Fetched bridge:        ${rows.length}`);
  console.log(`  ticket_raw inserted/up:${ingestResult.inserted}/${ingestResult.updated}`);
  console.log(`  Projected:             ${proj.processed}`);
  console.log(`  Masuk bucket customer: ${inBucket.length}`);
  console.log(`  service_location dibuat:${created} (sudah ada: ${existing})`);
  console.log(`  Titik siap di map:     ${shown}`);
  console.log('══════════════════════════════════════════════════════\n');

  void prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  logger.error('[E2E-WarMap] Fatal:', { error: String(error) });
  console.error('\n❌ Fatal error:', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});