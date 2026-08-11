// ============================================================
// Seed & cleanup — uji visual alert ODP di War Map.
//
// Mengambil data CUSTOMER NYATA (sumber bridge/Nossa) lalu
// menggerombolkannya di 3 ODP terpilih:
//   ODP-A: 6 tiket → BERISIKO (>= criticalCount)
//   ODP-B: 4 tiket → WASPADA  (>= warnCount), +1 tiket tanpa device_name
//          sebagai bukti jalur "scatter-only" (terhitung via radius)
//   ODP-C: 2 tiket → kontrol, tanpa alert
//
// Penanda seed: barcode_dc ber-awalan "ODP-TEST-". device_name diisi nama
// ODP KML asli (mis. "ODP-RKT-FKT/01") agar jalur atribusi teruji nyata.
// service_no memakai service_no customer nyata (unik per titik,
// identik dengan model war map).
//
// Jalankan:
//   npx tsx scripts/test-odp-alerts-spawn.ts --seed
//   npx tsx scripts/test-odp-alerts-spawn.ts --verify
//   npx tsx scripts/test-odp-alerts-spawn.ts --cleanup
// ============================================================

import { prisma } from '../app/libs/prisma';
import { Prisma } from '@prisma/client';
import {
  computeOdpAlerts,
  DEFAULT_ODP_ALERT_OPTIONS,
  haversineKm,
  type DisturbancePointLike,
} from '../app/libs/kml/geo';
import { buildOperationalBucketWhere } from '../app/libs/services/ticket-buckets';

const MARKER_PREFIX = 'ODP-TEST-';
const CLUSTER = { critical: 6, warning: 4, control: 2 };
// Radius test/demo. Jaringan ODC-RKT-FKT sangat rapat (<0,8 km antar ODP),
// sehingga pemisahan tier (6/4/2) hanya deterministik di radius 0,5 km.
// Di UI War Map pilih "Radius Deteksi = 500 m".
const RADIUS_KM = 0.5;
const WARN_COUNT = 4;
const CRITICAL_COUNT = 6;

interface Target {
  odpId: number;
  name: string;
  lat: number;
  lng: number;
  count: number;
  tier: 'critical' | 'warning' | 'none';
}

function bearingAwayFromMe(
  me: { lat: number; lng: number },
  others: Array<{ lat: number; lng: number }>,
): number {
  if (others.length === 0) return Math.random() * Math.PI * 2;
  // arah rata-rata ke semua tetangga, lalu dibalik 180°
  let x = 0;
  let y = 0;
  for (const o of others) {
    const dLng = (o.lng - me.lng) * Math.cos((me.lat * Math.PI) / 180);
    const dLat = o.lat - me.lat;
    x += dLat;
    y += dLng;
  }
  const toward = Math.atan2(y, x);
  return toward + Math.PI;
}

// Offset rapat 30–80 m dengan deviasi kecil (±14°) menjauhi tetangga,
// agar di radius 0,5 km tiap klaster tidak bocor ke ODP lain.
function clusterCoords(
  centerLat: number,
  centerLng: number,
  awayDir: number,
  count: number,
): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < count; i++) {
    const r = 0.03 + (i % 3) * 0.02 + Math.random() * 0.01; // 30–80 m
    const angle = awayDir + ((i % 2) - 0.5) * 0.25; // ±~14°
    out.push({
      lat: centerLat + (Math.sin(angle) * r) / 111,
      lng: centerLng + (Math.cos(angle) * r) / (111 * Math.cos((centerLat * Math.PI) / 180)),
    });
  }
  return out;
}

async function pickOdps(requireClean: boolean): Promise<Target[]> {
  const odps = await prisma.kml_feature.findMany({
    where: {
      node_role: 'odp',
      feature_type: 'point',
      latitude: { not: null },
      longitude: { not: null },
    },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const rows = await prisma.service_location.findMany({ select: { latitude: true, longitude: true } });
  const pts = rows.map((r) => [r.latitude.toNumber(), r.longitude.toNumber()]);

  const dist = odps.map((o) => ({
    odpId: o.id,
    name: o.name,
    lat: o.latitude!.toNumber(),
    lng: o.longitude!.toNumber(),
    minDistToPoint: pts.reduce(
      (m, [pl, pg]) => Math.min(m, haversineKm(o.latitude!.toNumber(), o.longitude!.toNumber(), pl, pg)),
      Infinity,
    ),
  }));
  let pool = dist;
  if (requireClean) {
    const clean = dist.filter((d) => d.minDistToPoint > RADIUS_KM);
    if (clean.length < 3) throw new Error(`Tidak cukup ODP bersih (${clean.length})`);
    pool = clean;
  }

  // Greedy: pilih dgn jarak minimal antar-O sebesar mungkin
  const chosen: Array<(typeof pool)[number]> = [pool[0]];
  while (chosen.length < 3) {
    let best: (typeof pool)[number] | null = null;
    let bestMin = -1;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      const minD = Math.min(
        ...chosen.map((s) => haversineKm(s.lat, s.lng, c.lat, c.lng)),
      );
      if (minD > bestMin) {
        bestMin = minD;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
  }

  const [a, b, c] = chosen;
  return [
    { ...a, count: CLUSTER.critical, tier: 'critical' },
    { ...b, count: CLUSTER.warning, tier: 'warning' },
    { ...c, count: CLUSTER.control, tier: 'none' },
  ] as unknown as Target[];
}

async function fetchCustomerTickets(targets: Target[]): Promise<Array<{ service_no: string; id_ticket: number; incident: string; customer_name: string | null; status_update: string | null }>> {
  const existing = await prisma.service_location.findMany({ select: { service_no: true } });
  const have = new Set(existing.map((e) => e.service_no));

  const candidates = await prisma.ticket.findMany({
    where: {
      AND: [
        { service_no: { not: null } },
        buildOperationalBucketWhere('kpi_customer') as Prisma.ticketWhereInput,
      ],
    },
    orderBy: { sync_date: 'desc' },
    take: 80,
    select: {
      service_no: true,
      id_ticket: true,
      incident: true,
      customer_name: true,
      status_update: true,
    },
  });

  const need = targets.reduce(
    (n, t) => n + t.count + (t.tier === 'warning' ? 1 : 0),
    0,
  );
  const seen = new Set<string>();
  const picked: Array<{ service_no: string; id_ticket: number; incident: string; customer_name: string | null; status_update: string | null }> = [];
  for (const t of candidates) {
    const sn = t.service_no as string;
    if (!sn || have.has(sn) || seen.has(sn)) continue;
    seen.add(sn);
    picked.push({ ...t, service_no: sn });
    if (picked.length >= need) break;
  }
  if (picked.length < need) {
    throw new Error(`Kurang tiket customer baru: butuh ${need}, dapat ${picked.length}. Jalankan --cleanup lalu coba lagi, atau tunggu sinkron bridge.`);
  }
  return picked;
}

async function seed(targets: Target[], tickets: Array<{ service_no: string; id_ticket: number; incident: string; customer_name: string | null; status_update: string | null }>) {
  const teknisi = await prisma.users.findFirst({
    where: { role_id: { not: null }, ticket: { some: {} } },
    orderBy: { id_user: 'asc' },
    select: { id_user: true, nama: true },
  });
  if (!teknisi) throw new Error('Tidak ada teknisi referensi di DB.');

  let ti = 0;
  let created = 0;
  for (const t of targets) {
    const awayDir = bearingAwayFromMe(
      { lat: t.lat, lng: t.lng },
      targets.filter((o) => o !== t).map((o) => ({ lat: o.lat, lng: o.lng })),
    );
    // Klaster warning mendapat +1 titik TANPA device_name →
    // membuktikan jalur scatter-only (terhitung via radius, bukan atribusi).
    const isWarning = t.tier === 'warning';
    const nth = isWarning ? t.count + 1 : t.count;
    const coords = clusterCoords(t.lat, t.lng, awayDir, nth);
    for (let ci = 0; ci < coords.length; ci++) {
      const c = coords[ci];
      const ticket = tickets[ti++];
      const marker = `${MARKER_PREFIX}v${Date.now() % 90000}-${String(ti).padStart(2, '0')}`;
      // device_name memakai nama ODP KML asli sehingga jalur atribusi aktif;
      // penanda seed cukup di barcode_dc.
      const deviceName = isWarning && ci === coords.length - 1 ? null : t.name;
      const loc = await prisma.service_location.create({
        data: {
          service_no: ticket.service_no,
          customer_name: ticket.customer_name,
          alamat: `Titik uji ODP di sekitar ${t.name}`,
          latitude: new Prisma.Decimal(c.lat.toFixed(7)),
          longitude: new Prisma.Decimal(c.lng.toFixed(7)),
          accuracy_meters: new Prisma.Decimal((8 + (ti % 10)).toFixed(2)),
          device_name: deviceName,
          barcode_dc: marker,
          workzone: 'RKT',
          last_ticket_id: ticket.id_ticket,
          last_teknisi_id: teknisi.id_user,
          tagged_count: 1,
        },
      });
      await prisma.service_location_history.create({
        data: {
          service_location_id: loc.id,
          ticket_id: ticket.id_ticket,
          incident: ticket.incident,
          service_no: ticket.service_no,
          customer_name: ticket.customer_name,
          alamat: `Titik uji ODP di sekitar ${t.name}`,
          latitude: new Prisma.Decimal(c.lat.toFixed(7)),
          longitude: new Prisma.Decimal(c.lng.toFixed(7)),
          accuracy_meters: new Prisma.Decimal((8 + (ti % 10)).toFixed(2)),
          device_name: deviceName,
          barcode_dc: marker,
          workzone: 'RKT',
          teknisi_user_id: teknisi.id_user,
          source: 'manual_tag',
          tagged_at: new Date(),
        },
      });
      created++;
    }
    console.log(
      `  • ${t.name} → ${t.count} titik (${t.tier})${isWarning ? ' + 1 tanpa device_name' : ''} | koordinat ${t.lat}, ${t.lng}`,
    );
  }
  return created;
}

async function verify(targets: Target[]) {
  const odps = await prisma.kml_feature.findMany({
    where: { id: { in: targets.map((t) => t.odpId) } },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  const rows = await prisma.service_location.findMany({
    select: {
      service_no: true,
      customer_name: true,
      latitude: true,
      longitude: true,
      device_name: true,
      last_ticket: { select: { status_update: true, incident: true } },
    },
  });
  const dist: DisturbancePointLike[] = rows
    .filter((r) => r.latitude !== null && r.longitude !== null)
    .map((r) => ({
      id: 0,
      serviceNo: r.service_no,
      customerName: r.customer_name,
      name: r.service_no,
      latitude: r.latitude.toNumber(),
      longitude: r.longitude.toNumber(),
      deviceName: r.device_name,
      isHot: false,
      historyCount60d: 0,
      lastTicket: r.last_ticket
        ? { statusUpdate: r.last_ticket.status_update, incident: r.last_ticket.incident }
        : null,
    }));

  const alerts = computeOdpAlerts(
    odps.map((o) => ({ id: o.id, name: o.name, latitude: o.latitude!.toNumber(), longitude: o.longitude!.toNumber() })),
    dist,
    { radiusKm: RADIUS_KM, criticalCount: CRITICAL_COUNT, warnCount: WARN_COUNT },
  );
  const byOdp = new Map(alerts.map((a) => [a.odpId, a]));

  let ok = true;
  for (const t of targets) {
    const a = byOdp.get(t.odpId);
    const got = a ? a.tier : 'none';
    const good = got === t.tier;
    if (!good) ok = false;
    console.log(
      `${good ? '  ✓' : '  ✗'} ${t.name} → harap ${t.tier}, aktual ${got}${a ? ` (total=${a.totalPoints})` : ''}`,
    );
  }
  return ok;
}

async function cleanup() {
  const rows = await prisma.service_location.findMany({
    where: {
      OR: [
        { device_name: { startsWith: MARKER_PREFIX } },
        { barcode_dc: { startsWith: MARKER_PREFIX } },
      ],
    },
    select: { id: true, service_no: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    console.log('Tidak ada data uji ODP-TEST-* untuk dihapus.');
    return;
  }
  const removed = await prisma.service_location.deleteMany({ where: { id: { in: ids } } });
  console.log(`🧹 ${removed.count} lokasi uji dihapus: ${rows.map((r) => r.service_no).join(', ')}`);
}

async function main() {
  const mode = process.argv.includes('--seed')
    ? 'seed'
    : process.argv.includes('--verify')
      ? 'verify'
      : process.argv.includes('--cleanup')
        ? 'cleanup'
        : 'help';

  if (mode === 'help') {
    console.log('Gunakan: --seed | --verify | --cleanup');
    return;
  }

  if (mode === 'cleanup') {
    await cleanup();
    await prisma.$disconnect();
    return;
  }

  console.log('== Uji visual alert ODP (data customer dari bridge) ==\n');

  if (mode === 'verify') {
    const targets = await pickOdps(false);
    const ok = await verify(targets);
    console.log(ok ? '\n✅ Kondisi seed sesuai target.' : '\n❌ Kondisi tidak sesuai — jalankan --cleanup lalu --seed ulang.');
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  }

  // seed
  if (await cleanHasRows()) {
    console.error('❌ Masih ada data ODP-TEST-* dari sebelumnya. Jalankan --cleanup dulu.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const targets = await pickOdps(true);
  console.log('ODP terpilih:');
  for (const t of targets) {
    console.log(`  ${t.name} → ${t.count} tiket (${t.tier}) at ${t.lat}, ${t.lng}`);
  }

  const tickets = await fetchCustomerTickets(targets);
  console.log(`Mengambil ${tickets.length} tiket customer nyata dari bridge/ticket.`);

  const created = await seed(targets, tickets);
  console.log(`\n✅ ${created} titik uji dibuat.\n`);

  const ok = await verify(targets);
  console.log(ok ? '\n✅ Trio alert siap: buka /admin/tools/war-map → Panel Layer "Radius Deteksi = 500 m".' : '\n⚠️ Verifikasi selisih — jalankan --verify ulang atau --cleanup.');

  await prisma.$disconnect();
}

async function cleanHasRows(): Promise<boolean> {
  const n = await prisma.service_location.count({
    where: {
      OR: [
        { device_name: { startsWith: MARKER_PREFIX } },
        { barcode_dc: { startsWith: MARKER_PREFIX } },
      ],
    },
  });
  return n > 0;
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});