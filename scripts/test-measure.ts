/**
 * Unit test utilitas geometri alat ukur jarak War Map.
 * Run: npm run test:measure  (atau npx tsx scripts/test-measure.ts)
 */

import {
  type LatLng,
  distKm,
  cumulativeLengthsKm,
  polylineLengthKm,
  pointToSegmentDistanceKm,
  pointAlongPolyline,
  samplePolylineBetween,
  distanceAlongPolylineAtPoint,
  bearingDeg,
  formatDistanceKm,
  formatDistanceMeters,
  buildCablesFromLines,
  type CableLineInput,
} from '@/app/libs/warmap/measure';

let passCount = 0;
let failCount = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${name}`);
  } else {
    failCount++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function near(a: number, b: number, tol = 1e-2) {
  return Math.abs(a - b) <= tol;
}

function closeLatLng(a: LatLng, b: LatLng, tol = 1e-4) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

console.log('── Jarak haversine ──');
{
  const d = distKm([0, 0], [0, 1]);
  assert('1° lng di khatulistiwa ≈ 111.19 km', near(d, 111.19), `got ${d}`);
  const d2 = distKm([-7.1831, 112.7117], [-7.1831, 112.7127]);
  assert('1e-3° lng ≈ 0.102 km', near(d2, 0.102, 1e-2), `got ${d2}`);
  assert('jarak titik yang sama = 0', distKm([0, 0], [0, 0]) === 0);
}

console.log('── Panjang polyline & kumulatif ──');
{
  // dua titik: (0,0) → (0,1)
  const coords: LatLng[] = [
    [0, 0],
    [0, 1],
  ];
  const cum = cumulativeLengthsKm(coords);
  assert('kumulatif[0]=0', cum[0] === 0);
  assert('kumulatif[1]=dist', near(cum[1], distKm(coords[0], coords[1])));
  assert('panjang total', near(polylineLengthKm(coords), cum[1]));

  // jalur bengkok: (0,0) → (1,0) → (1,1)
  const bent: LatLng[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  const bcum = cumulativeLengthsKm(bent);
  const expected = distKm(bent[0], bent[1]) + distKm(bent[1], bent[2]);
  assert('panjang jalur bengkok = jumlah segmen', near(bcum[2], expected), `got ${bcum[2]}`);
}

console.log('── Proyeksi ke segmen ──');
{
  const p: LatLng = [0.001, 0.5];
  const a: LatLng = [0, 0];
  const b: LatLng = [0, 1];
  const d = pointToSegmentDistanceKm(p, a, b);
  assert('jarak titik ke segmen ≈ 0.111 km', near(d, 0.111, 1e-2), `got ${d}`);
}

console.log('── Interpolasi sepanjang polyline ──');
{
  const bent: LatLng[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  const cum = cumulativeLengthsKm(bent);
  const mid = pointAlongPolyline(bent, cum, cum[1] / 2);
  assert(
    'titik tengah segmen pertama = rata-rata',
    closeLatLng(mid, [(0 + 1) / 2, 0]),
    `got ${mid}`,
  );
  const vertex = pointAlongPolyline(bent, cum, cum[1]);
  assert(
    'pada kumulatif segmen pertama → vertex (1,0)',
    closeLatLng(vertex, [1, 0]),
    `got ${vertex}`,
  );
  const clamped = pointAlongPolyline(bent, cum, cum[2] * 2);
  assert(
    'clamp di luar panjang → ujung kabel',
    closeLatLng(clamped, [1, 1]),
    `got ${clamped}`,
  );
  const final = pointAlongPolyline(bent, cum, cum[2]);
  assert('tepat di ujung kabel', closeLatLng(final, [1, 1]));
}

console.log('── Jarak-kumulatif titik yang diproyeksikan ──');
{
  const bent: LatLng[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  const cum = cumulativeLengthsKm(bent);
  const s = distanceAlongPolylineAtPoint(bent, cum, [0.5, 0]);
  assert('titik di tengah segmen pertama → s ≈ cum[1]/2', near(s, cum[1] / 2), `got ${s}`);
}

console.log('── Sampling highlight ──');
{
  const bent: LatLng[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  const cum = cumulativeLengthsKm(bent);
  const samples = samplePolylineBetween(bent, cum, cum[0], cum[2], 10);
  assert('jumlah sampling = samples+1', samples.length === 11);
  assert('awal sampling = start', closeLatLng(samples[0], bent[0]));
  assert('akhir sampling = end', closeLatLng(samples[10], bent[2]));
}

console.log('── Bearing ──');
{
  assert('(0,0)→(0,1) = 90° (timur)', near(bearingDeg([0, 0], [0, 1]), 90, 1), `got ${bearingDeg([0,0],[0,1])}`);
  assert('(0,0)→(1,0) = 0° (utara)', near(bearingDeg([0, 0], [1, 0]), 0, 1));
  assert('(0,0)→(-1,0) = 180° (selatan)', near(bearingDeg([0, 0], [-1, 0]), 180, 1));
}

console.log('── Format ──');
{
  assert('500 m → "500 m"', formatDistanceKm(0.5) === '500 m');
  assert('1.2 km → "1,2 km"', formatDistanceKm(1.2) === '1,2 km');
  assert('formatDistanceMeters 1500 → "1,5 km"', formatDistanceMeters(1500) === '1,5 km');
}

console.log('── Penggabungan span menjadi kabel (buildCablesFromLines) ──');
{
  const D03 = 'ODC-RKT-FKT > DISTRIBUSI > D.03';
  const span = (
    id: number,
    name: string,
    folderPath: string,
    sublayerId: number,
    coords: [number, number][],
  ): CableLineInput => ({ id, name, folderPath, sublayerId, coordinates: coords });

  // (a) rantai 3 span lengan D.03 → 1 kabel utuh
  const chain = [
    span(1, 'DS-RKT-FE-53-01-03/03-01', D03, 7, [
      [112.7579, -7.3161],
      [112.7574, -7.3156],
    ]),
    span(2, 'DS-RKT-FE-53-01-03/03-02', D03, 7, [
      [112.757399, -7.315601],
      [112.757, -7.3151],
    ]),
    span(3, 'DS-RKT-FE-53-01-03/03-03', D03, 7, [
      [112.756999, -7.315101],
      [112.7566, -7.3147],
    ]),
  ];
  const chainCables = buildCablesFromLines(chain);
  assert('rantai 3 span → 1 kabel', chainCables.length === 1, `got ${chainCables.length}`);
  const chainCable = chainCables[0];
  assert(
    'nama kabel = prefix · folder',
    chainCable.name === 'DS-RKT-FE-53-01-03 · D.03',
    `got "${chainCable.name}"`,
  );
  assert(
    'koordinat gabungan 4 titik (duplikat junction dibuang)',
    chainCable.coords.length === 4,
    `got ${chainCable.coords.length}`,
  );
  const expectedLen =
    distKm([-7.3161, 112.7579], [-7.3156, 112.7574]) +
    distKm([-7.315601, 112.757399], [-7.3151, 112.757]) +
    distKm([-7.315101, 112.756999], [-7.3147, 112.7566]);
  assert(
    'panjang kabel = jumlah seluruh span',
    near(polylineLengthKm(chainCable.coords), expectedLen, 0.01),
    `got ${polylineLengthKm(chainCable.coords)} vs ${expectedLen}`,
  );

  // (b) fan 5 lengan berbagi hub → 5 kabel terpisah
  const H: [number, number] = [112.7579, -7.3161];
  const fan = [
    span(10, 'DS-Y/04-01', 'ODC-RKT-FKT > DISTRIBUSI > D.04', 8, [H, [112.7574, -7.3156]]),
    span(11, 'DS-Y/04-02', 'ODC-RKT-FKT > DISTRIBUSI > D.04', 8, [H, [112.7574, -7.3165]]),
    span(12, 'DS-Y/04-03', 'ODC-RKT-FKT > DISTRIBUSI > D.04', 8, [H, [112.7584, -7.3166]]),
    span(13, 'DS-Y/04-04', 'ODC-RKT-FKT > DISTRIBUSI > D.04', 8, [H, [112.7586, -7.3158]]),
    span(14, 'DS-Y/04-05', 'ODC-RKT-FKT > DISTRIBUSI > D.04', 8, [H, [112.758, -7.3163]]),
  ];
  const fanCables = buildCablesFromLines(fan);
  assert('fan 5 lengan → 5 kabel', fanCables.length === 5, `got ${fanCables.length}`);
  assert(
    'lengan satu span tetap pakai nama fitur',
    fanCables.every((c) => c.coords.length === 2),
  );

  // (c) rantai bercabang (drop) → rantai utama + drop terpisah
  const P3: [number, number] = [112.756999, -7.315001];
  const branch = [
    span(20, 'DS-RKT-FE-53-01-03/05-01', 'ODC-RKT-FKT > DISTRIBUSI > D.05', 9, [
      [112.7579, -7.3161],
      [112.7574, -7.3156],
    ]),
    span(21, 'DS-RKT-FE-53-01-03/05-02', 'ODC-RKT-FKT > DISTRIBUSI > D.05', 9, [
      [112.757399, -7.315601],
      P3,
    ]),
    span(22, 'DS-RKT-FE-53-01-03/05-03', 'ODC-RKT-FKT > DISTRIBUSI > D.05', 9, [
      P3,
      [112.7566, -7.3146],
    ]),
    span(23, 'DS-RKT-FE-53-01-03/05-03-01', 'ODC-RKT-FKT > DISTRIBUSI > D.05', 9, [
      P3,
      [112.7565, -7.3151],
    ]),
  ];
  const branchCables = buildCablesFromLines(branch);
  assert('rantai bercabang → 3 kabel', branchCables.length === 3, `got ${branchCables.length}`);
  assert(
    'rantai utama berhenti di titik cabang (2 span)',
    branchCables.some((c) => c.coords.length === 3 && c.name === 'DS-RKT-FE-53-01-03 · D.05'),
  );
  assert(
    'drop → kabel sendiri',
    branchCables.some((c) => c.name === 'DS-RKT-FE-53-01-03/05-03-01'),
  );

  // (d) span terisolasi → kabel sendiri
  const isolated = [
    span(30, 'DS-Z/06-01', 'ODC-RKT-FKT > DISTRIBUSI > D.06', 10, [
      [112.7579, -7.3161],
      [112.7574, -7.3156],
    ]),
  ];
  const isolatedCables = buildCablesFromLines(isolated);
  assert('span terisolasi → 1 kabel', isolatedCables.length === 1);
  assert(
    'nama span terisolasi tidak diubah',
    isolatedCables[0].name === 'DS-Z/06-01',
    `got "${isolatedCables[0].name}"`,
  );

  // (e) gap > toleransi → 2 kabel
  const gapped = [
    span(40, 'DS-G/07-01', 'ODC-RKT-FKT > DISTRIBUSI > D.07', 11, [
      [112.7579, -7.3161],
      [112.7574, -7.3156],
    ]),
    span(41, 'DS-G/07-02', 'ODC-RKT-FKT > DISTRIBUSI > D.07', 11, [
      [112.7574, -7.3155],
      [112.7566, -7.3147],
    ]),
  ];
  const gappedCables = buildCablesFromLines(gapped);
  assert(
    'gap > 6 m → tidak disambung',
    gappedCables.length === 2,
    `got ${gappedCables.length}`,
  );
}

console.log(`\n── Ringkasan ──`);
console.log(`${passCount} passing, ${failCount} gagal.`);
process.exit(failCount > 0 ? 1 : 0);
