import { prisma } from '../app/libs/prisma';
import { Prisma } from '@prisma/client';
import { buildOperationalBucketWhere } from '../app/libs/services/ticket-buckets';

// ============================================================
// Seed demo — War Map (PRD War-Map-Geo-Tagging-Gangguan)
// Membuat titik service_location yang mewakili TIGA bucket
// operasional: Customer (kpi_customer), Proactive (kpi_proactive),
// dan Unspec (non_kpi_unspec). Setiap titik memakai last_ticket
// NYATA yang memenuhi definisi bucket (buildOperationalBucketWhere),
// sehingga filter bucket + jenis di war map langsung teruji.
// Idempotent: upsert per service_no; data TEST lama dihapus.
// ============================================================

interface BucketSpec {
  key: 'customer' | 'proactive' | 'unspec';
  bucketKey: 'kpi_customer' | 'kpi_proactive' | 'non_kpi_unspec';
  ticketTake: number;
}

const BUCKETS: BucketSpec[] = [
  { key: 'customer', bucketKey: 'kpi_customer', ticketTake: 3 },
  { key: 'proactive', bucketKey: 'kpi_proactive', ticketTake: 3 },
  { key: 'unspec', bucketKey: 'non_kpi_unspec', ticketTake: 3 },
];

// Koordinat demo tersebar di area Surabaya — workzone pakai nama_sa asli.
const DEMO_COORDS: Array<{
  lat: number;
  lng: number;
  workzone: string;
  alamat: string;
}> = [
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

// service_no TEST lama yang harus dihapus (tidak lagi dipakai seed).
const OLD_TEST_SERVICE_NOS = [
  'SBY-TEST-0001',
  'SBY-TEST-0002',
  'SBY-TEST-0003',
  'SBY-TEST-0004',
  'SBY-TEST-0005',
  'GRS-TEST-0006',
  'GRS-TEST-0007',
  'SDA-TEST-0008',
  'SDA-TEST-0009',
  'MDRA-TEST-0010',
  'GRS-TEST-0011',
  'SBY-TEST-0012',
];

async function main() {
  console.log('== Seed War Map (berbasis bucket) — dimulai ==\n');

  // ── Bersihkan data TEST lama ────────────────────────────────
  const removedHist = await prisma.service_location_history.deleteMany({
    where: { service_no: { in: OLD_TEST_SERVICE_NOS } },
  });
  const removedLoc = await prisma.service_location.deleteMany({
    where: { service_no: { in: OLD_TEST_SERVICE_NOS } },
  });
  if (removedHist.count || removedLoc.count) {
    console.log(
      `🧹 Bersihkan data lama: ${removedLoc.count} lokasi, ${removedHist.count} histori.`,
    );
  }

  // ── Referensi teknisi ─────────────────────────────────────
  const teknisi = await prisma.users.findFirst({
    where: { role_id: { not: null }, ticket: { some: {} } },
    orderBy: { id_user: 'asc' },
    select: { id_user: true, nama: true },
  });
  if (!teknisi) {
    console.error('❌ Tidak ada user teknisi di DB — seed dibatalkan.');
    process.exit(1);
  }
  console.log(`Teknisi referensi: #${teknisi.id_user} (${teknisi.nama ?? 'no-name'})`);

  let created = 0;
  let updated = 0;
  let coordIdx = 0;

  for (const spec of BUCKETS) {
    const tickets = await prisma.ticket.findMany({
      where: {
        AND: [
          { service_no: { not: null } },
          buildOperationalBucketWhere(spec.bucketKey) as Prisma.ticketWhereInput,
        ],
      },
      orderBy: { sync_date: 'desc' },
      take: spec.ticketTake,
      select: {
        id_ticket: true,
        incident: true,
        service_no: true,
        customer_name: true,
      },
    });

    if (tickets.length === 0) {
      console.warn(`⚠️  Bucket ${spec.key} tidak menemukan tiket — dilewati.`);
      continue;
    }
    console.log(
      `\nBucket ${spec.key} (${spec.bucketKey}) — ${tickets.length} tiket`,
    );

    for (const t of tickets) {
      const coord = DEMO_COORDS[coordIdx % DEMO_COORDS.length];
      coordIdx++;
      const snapshot = {
        service_no: t.service_no as string,
        customer_name: t.customer_name,
        alamat: coord.alamat,
        latitude: new Prisma.Decimal(coord.lat.toFixed(7)),
        longitude: new Prisma.Decimal(coord.lng.toFixed(7)),
        accuracy_meters: new Prisma.Decimal(
          (8 + (coordIdx % 10)).toFixed(2),
        ),
        device_name: `ODP-${coord.workzone}-SEED/${String(coordIdx).padStart(2, '0')}`,
        barcode_dc: `BCR-${coord.workzone}-${String(coordIdx).padStart(2, '0')}`,
        workzone: coord.workzone,
      };

      const existing = await prisma.service_location.findUnique({
        where: { service_no: snapshot.service_no },
      });

      let loc;
      if (existing) {
        await prisma.service_location.update({
          where: { id: existing.id },
          data: {
            ...snapshot,
            last_ticket_id: t.id_ticket,
            last_teknisi_id: teknisi.id_user,
            tagged_count: { increment: 1 },
          },
        });
        updated++;
      } else {
        loc = await prisma.service_location.create({
          data: {
            ...snapshot,
            last_ticket_id: t.id_ticket,
            last_teknisi_id: teknisi.id_user,
            tagged_count: 1,
          },
        });
        created++;

        // Satu histori snapshot hanya saat create (hindari penumpukan pada re-run).
        await prisma.service_location_history.create({
          data: {
            service_location_id: loc.id,
            ticket_id: t.id_ticket,
            incident: t.incident,
            service_no: snapshot.service_no,
            customer_name: snapshot.customer_name,
            alamat: snapshot.alamat,
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
            accuracy_meters: snapshot.accuracy_meters,
            device_name: snapshot.device_name,
            barcode_dc: snapshot.barcode_dc,
            workzone: snapshot.workzone,
            teknisi_user_id: teknisi.id_user,
            source: 'manual_tag',
            tagged_at: new Date(),
          },
        });
        console.log(`  • ${t.incident} → ${snapshot.service_no}`);
      }
    }
  }

  console.log(`\n✅ Selesai. ${created} lokasi dibuat, ${updated} diperbarui + histori ditambahkan.`);
  console.log('\n➡️  Buka: /admin/tools/war-map → filter Bucket (Customer / Proactive / Unspec).');
  void prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});