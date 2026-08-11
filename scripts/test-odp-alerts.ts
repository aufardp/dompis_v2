// ============================================================
// Test deterministik — aturan alert ODP berbasis jumlah tiket.
// Ranah: < warnCount (4) → tak ada alert; >= 4 → WASPADA;
// >= criticalCount (6) → BERISIKO. Satu service_no dihitung sekali.
//
// Jalankan: npx tsx scripts/test-odp-alerts.ts
// ============================================================

import {
  computeOdpAlerts,
  DEFAULT_ODP_ALERT_OPTIONS,
  type DisturbancePointLike,
  type OdpPointLike,
} from '../app/libs/kml/geo';

class TestFailure extends Error {}

let passed = 0;
let failed = 0;

function makeOdp(id: number, lat = -7.3, lng = 112.75): OdpPointLike {
  return { id, name: `ODP-${String(id).padStart(2, '0')}`, latitude: lat, longitude: lng };
}

function makePoint(
  serviceNo: string,
  lat: number,
  lng: number,
  opts: {
    status?: string | null;
    isHot?: boolean;
    historyCount60d?: number;
    deviceName?: string | null;
  } = {},
): DisturbancePointLike {
  const { status = 'close', isHot = false, historyCount60d = 0, deviceName = null } = opts;
  return {
    id: serviceNo.length,
    serviceNo,
    customerName: `Customer ${serviceNo}`,
    name: serviceNo,
    latitude: lat,
    longitude: lng,
    deviceName,
    isHot,
    historyCount60d,
    lastTicket: { statusUpdate: status, incident: `INC${serviceNo}` },
  };
}

// 9 titik dalam radius 1 km di sekitar pusat (lat,lng) dipakai semua skenario.
function clusterAt(lat: number, lng: number, n: number): DisturbancePointLike[] {
  const pts: DisturbancePointLike[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = 0.3; // km (< radius default 1 km)
    pts.push(
      makePoint(`SVC-${i + 1}`, lat + (Math.sin(ang) * r) / 111, lng + (Math.cos(ang) * r) / 111),
    );
  }
  return pts;
}

function cluster(n: number): DisturbancePointLike[] {
  return clusterAt(-7.3, 112.75, n);
}

function expectTier(
  label: string,
  pts: DisturbancePointLike[],
  expected: 'none' | 'warning' | 'critical',
  opts = DEFAULT_ODP_ALERT_OPTIONS,
) {
  const alerts = computeOdpAlerts([makeOdp(1)], pts, opts);
  const got = alerts.length === 0 ? 'none' : alerts[0].tier;
  const ok = got === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label} → ${expected} (total=${pts.length})`);
  } else {
    failed++;
    console.error(`  ✗ ${label} → expected ${expected}, got ${got} (total=${pts.length})`);
    throw new TestFailure(label);
  }
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

async function main() {
  console.log('== Test aturan alert ODP (berbasis jumlah tiket/service_no) ==');

  section('Ambang jumlah tiket');
  expectTier('0 tiket → tidak ada alert', [], 'none');
  expectTier('2 tiket → tidak ada alert', cluster(2), 'none');
  expectTier('3 tiket → tidak ada alert (batas >3)', cluster(3), 'none');
  expectTier('4 tiket → WASPADA', cluster(4), 'warning');
  expectTier('5 tiket → WASPADA', cluster(5), 'warning');
  expectTier('6 tiket → BERISIKO', cluster(6), 'critical');
  expectTier('7 tiket → BERISIKO', cluster(7), 'critical');

  section('Satu service_no dihitung satu kali (model war map)');
  {
    const dup = [
      makePoint('SVC-1', -7.3, 112.75, { status: 'open' }),
      makePoint('SVC-1', -7.301, 112.751, { status: 'open' }),
      makePoint('SVC-1', -7.302, 112.752, { status: 'open' }),
      makePoint('SVC-2', -7.3001, 112.7501, { status: 'open' }),
    ];
    const alerts = computeOdpAlerts([makeOdp(1)], dup);
    const got = alerts.length === 0 ? 'none' : alerts[0];
    // 2 service_no unik → skor total 2 → tanpa alert
    const ok = got === 'none';
    if (ok) {
      passed++;
      console.log(`  ✓ duplicate service_no tidak digandakan → tidak ada alert (2 service_no unik)`);
    } else {
      failed++;
      console.error(`  ✗ duplicate service_no terhitung ganda (total=${got && got.totalPoints})`);
      throw new TestFailure('dedup');
    }
  }

  section('Batas radius (1 km)');
  {
    const o = makeOdp(1, -7.3, 112.75);
    const inside = cluster(4).map((p, i) => ({
      ...p,
      latitude: -7.3 + ((i + 1) * 0.08) / 111,
      longitude: 112.75 + ((i + 1) * 0.06) / 111,
    }));
    const edge = makePoint('EDGE-1', -7.3 + 0.9 / 111, 112.75 + 0.9 / 111, { status: 'open' }); // ~1.27 km (di luar)
    const alerts = computeOdpAlerts([o], [...inside, edge]);
    const data = alerts[0];
    const ok =
      data &&
      data.totalPoints === 4 &&
      data.nearby.every((n) => n.serviceNo !== 'EDGE-1');
    if (ok) {
      passed++;
      console.log(`  ✓ 4 titik dalam radius dihitung, titik di luar (EDGE-1) diabaikan`);
    } else {
      failed++;
      console.error(`  ✗ salah: total=${data ? data.totalPoints : 0}`);
      throw new TestFailure('radius');
    }
  }

  section('Radius dinamis + hitungan aktif/berulang');
  {
    const pts = cluster(4).map((p, i) =>
      i === 0 ? { ...p, lastTicket: { statusUpdate: 'open', incident: 'INC-open' } } : p,
    );
    const alertsSmall = computeOdpAlerts([makeOdp(1)], pts, { radiusKm: 0.2, criticalCount: 6, warnCount: 4 });
    if (alertsSmall.length === 0) {
      passed++;
      console.log(`  ✓ radius 0.2 km → 0 alert (klaster di luar radius)`);
    } else { failed++; throw new TestFailure('radius-small'); }
    const alertsBig = computeOdpAlerts([makeOdp(1)], pts, { radiusKm: 2, criticalCount: 6, warnCount: 4 });
    const a = alertsBig[0];
    if (a && a.tier === 'warning' && a.totalPoints === 4 && a.activeCount === 1) {
      passed++;
      console.log(`  ✓ radius 2 km → warning, total=4, aktif=1 (status diperhitungkan)`);
    } else { failed++; console.error('  ✗ radius 2km:', JSON.stringify(a)); throw new TestFailure('radius-big'); }
  }

  section('Pengurutan: total tertinggi dulu, critical sebelum warning');
  {
    const a6 = clusterAt(-7.3, 112.75, 6);
    const a4 = clusterAt(-7.2, 112.7, 4);
    const alerts = computeOdpAlerts([makeOdp(1), makeOdp(2, -7.2, 112.7)], [...a6, ...a4]);
    const ok =
      alerts.length === 2 &&
      alerts[0].name === 'ODP-01' &&
      alerts[0].tier === 'critical' &&
      alerts[0].totalPoints === 6 &&
      alerts[1].name === 'ODP-02' &&
      alerts[1].tier === 'warning' &&
      alerts[1].totalPoints === 4;
    if (ok) {
      passed++;
      console.log(`  ✓ sort → [ODP-01 critical(6), ODP-02 warning(4)]`);
    } else {
      failed++;
      console.error('  ✗ urutan salah:', alerts.map((x) => `${x.name}:${x.tier}(${x.totalPoints})`).join(' '));
      throw new TestFailure('sort');
    }
  }

  section('Atribusi device_name ↔ ODP');
  {
    const o = makeOdp(1, -7.3, 112.75); // ODP-01
    const near3 = cluster(3); // SVC-1..3 dalam radius, deviceName null
    const farAttr = makePoint('FAR-ATTR', -7.3 + 2 / 111, 112.75 + 2 / 111, {
      deviceName: 'ODP-01  EXTRA-SUFFIX',
    }); // ~2,8 km (di luar radius) tapi device_name match ODP-01

    // A: 3 dekat + 1 jauh atribusi → total 4 → warning, atribusi berisi titik jauh
    const a = computeOdpAlerts([o], [...near3, farAttr]);
    const okA =
      a.length === 1 &&
      a[0].tier === 'warning' &&
      a[0].totalPoints === 4 &&
      a[0].attributed.length === 1 &&
      a[0].attributed[0].serviceNo === 'FAR-ATTR' &&
      a[0].nearby.length === 3;
    if (okA) {
      passed++;
      console.log(`  ✓ titik jauh + device_name match masuk attributed & menaikkan total ke 4 → warning`);
    } else {
      failed++;
      console.error('  ✗ A:', JSON.stringify(a[0]));
      throw new TestFailure('attribution-far');
    }

    // B: titik jauh TANPA device_name → tidak dihitung, total tetap 3 → bukan alert
    const b = computeOdpAlerts([o], [...near3, makePoint('FAR-NO-ATTR', -7.3 + 2 / 111, 112.75 + 2 / 111)]);
    if (b.length === 0) {
      passed++;
      console.log(`  ✓ titik jauh tanpa device_name tidak memengaruhi alert (total 3 → none)`);
    } else {
      failed++;
      console.error('  ✗ B:', JSON.stringify(b[0]));
      throw new TestFailure('attribution-none');
    }

    // C: 4 titik dalam radius, 1 di antaranya device_name match → attributed + nearby, dihitung sekali
    const c = computeOdpAlerts(
      [o],
      [
        ...cluster(3),
        makePoint('SVC-MATCH', -7.3005, 112.7505, { deviceName: 'odp-01 x' }),
      ],
    );
    const okC =
      c.length === 1 &&
      c[0].tier === 'warning' &&
      c[0].totalPoints === 4 &&
      c[0].attributed.length === 1 &&
      c[0].attributed[0].serviceNo === 'SVC-MATCH' &&
      c[0].nearby.length === 4;
    if (okC) {
      passed++;
      console.log(`  ✓ titik radius + device_name match → di attributed & nearby (total 4, dedup)`);
    } else {
      failed++;
      console.error('  ✗ C:', JSON.stringify(c[0]));
      throw new TestFailure('attribution-match');
    }
  }
  section('Ringkasan');
  console.log(`\n✅ ${passed} passing, ${failed} gagal.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  if (e instanceof TestFailure) process.exit(1);
  console.error('❌ Error:', e);
  process.exit(1);
});