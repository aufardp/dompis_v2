// Utilitas geometri untuk alat ukur jarak & estimasi titik putus di War Map.
// Konvensi: semua titik berupa [lat, lng] (tuple dua angka).
// Jarak memakai haversine; proyeksi/parameterisasi segmen memakai
// proyeksi equirectangular lokal (cukup akurat untuk skala meter-km).

export type LatLng = [number, number];

const R_KM = 6371;
const KM_PER_DEG_LAT = 110.574;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Jarak geodesik (haversine) antara dua titik, dalam km. */
export function distKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s));
}

/** Jarak kumulatif dari vertex pertama untuk tiap vertex, dalam km. */
export function cumulativeLengthsKm(coords: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    out.push(out[i - 1] + distKm(coords[i - 1], coords[i]));
  }
  return out;
}

/** Panjang total polyline, dalam km. */
export function polylineLengthKm(coords: LatLng[]): number {
  if (coords.length === 0) return 0;
  const cum = cumulativeLengthsKm(coords);
  return cum[cum.length - 1];
}

/** Proyeksi titik ke segmen (a→b) dengan model planar lokal. */
export function projectPointOnSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): { point: LatLng; t: number; distKm: number } {
  const cosLat = Math.cos(toRad(a[0])) || 1e-9;
  const kx = 111.32 * cosLat; // km per derajat lng
  const ky = KM_PER_DEG_LAT; // km per derajat lat
  const bx = (b[1] - a[1]) * kx;
  const by = (b[0] - a[0]) * ky;
  const px = (p[1] - a[1]) * kx;
  const py = (p[0] - a[0]) * ky;
  const dx = bx;
  const dy = by;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : (px * dx + py * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = t * dx;
  const cy = t * dy;
  return {
    point: [a[0] + cy / ky, a[1] + cx / kx],
    t,
    distKm: Math.hypot(px - cx, py - cy),
  };
}

export function pointToSegmentDistanceKm(p: LatLng, a: LatLng, b: LatLng): number {
  return projectPointOnSegment(p, a, b).distKm;
}

/**
 * Jarak sepanjang polyline (km) untuk titik yang sudah "menempel" ke polyline
 * (mis. hasil proyeksi). Mencari segmen terdekat lalu interpolasi kumulatif.
 */
export function distanceAlongPolylineAtPoint(
  coords: LatLng[],
  cum: number[],
  p: LatLng,
): number {
  let best = Infinity;
  let bestS = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const { t, distKm: d } = projectPointOnSegment(p, coords[i], coords[i + 1]);
    if (d < best) {
      best = d;
      bestS = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return bestS;
}

/** Panjang jalur kabel antara dua nilai jarak-kumulatif (km). */
export function distanceBetweenAlongPolyline(
  _coords: LatLng[],
  _cum: number[],
  sA: number,
  sB: number,
): number {
  return Math.abs(sB - sA);
}

/** Interpolasi koordinat pada jarak-kumulatif tertentu (dijepit 0..panjang). */
export function pointAlongPolyline(
  coords: LatLng[],
  cum: number[],
  targetKm: number,
): LatLng {
  const total = cum[cum.length - 1] ?? 0;
  const t = Math.max(0, Math.min(total, targetKm));
  let i = 0;
  while (i < coords.length - 2 && cum[i + 1] < t) i++;
  const segLen = cum[i + 1] - cum[i];
  const f = segLen === 0 ? 0 : (t - cum[i]) / segLen;
  return [
    coords[i][0] + f * (coords[i + 1][0] - coords[i][0]),
    coords[i][1] + f * (coords[i + 1][1] - coords[i][1]),
  ];
}

/** Sampling polyline antara dua jarak-kumulatif untuk rendering highlight. */
export function samplePolylineBetween(
  coords: LatLng[],
  cum: number[],
  sA: number,
  sB: number,
  samples = 40,
): LatLng[] {
  const lo = Math.min(sA, sB);
  const hi = Math.max(sA, sB);
  const pts: LatLng[] = [];
  for (let i = 0; i <= samples; i++) {
    const s = lo + ((hi - lo) * i) / samples;
    pts.push(pointAlongPolyline(coords, cum, s));
  }
  return pts;
}

/** Bearing awal (azimuth) antara dua titik, derajat 0–360. */
export function initialBearing(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a[0]);
  const phi2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  return initialBearing(a, b) % 360;
}

export function bearingCardinal(deg: number): string {
  const dirs = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx] ?? '';
}

/** Format jarak km → meter/km sesuai aturan PRD. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${(km * 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} m`;
  return `${km.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} km`;
}

export function formatDistanceMeters(m: number): string {
  if (m < 1000) return `${Math.round(m).toLocaleString('id-ID')} m`;
  return `${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km`;
}

/**
 * Toleransi (meter) untuk menganggap ujung dua span KML tersambung menjadi
 * satu kabel. Junction nyata antar span biasanya 1–3 m.
 */
export const SPAN_JOIN_TOLERANCE_M = 6;
const SPAN_JOIN_KM = SPAN_JOIN_TOLERANCE_M / 1000;

export interface CableLineInput {
  id: number;
  name: string;
  folderPath: string;
  sublayerId: number;
  /** Koordinat LineString KML: array [lng, lat]. */
  coordinates: [number, number][];
}

export interface BuiltCable {
  id: number;
  name: string;
  /** Koordinat gabungan kabel utuh: array [lat, lng]. */
  coords: LatLng[];
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return '';
  let prefix = strs[0];
  for (let i = 1; i < strs.length && prefix.length > 0; i++) {
    let j = 0;
    while (j < prefix.length && j < strs[i].length && prefix[j] === strs[i][j]) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}

/** Nama span KML tanpa segmen terakhir (`/03-03` → `DS-RKT-FE-53-01-03`). */
function cableBaseName(name: string): string {
  const idx = name.lastIndexOf('/');
  return idx >= 0 ? name.slice(0, idx) : name;
}

/** Segmen folder terakhir dari breadcrumb (`... > D.03` → `D.03`). */
function folderShortName(folderPath: string): string {
  const idx = folderPath.lastIndexOf('>');
  const last = idx >= 0 ? folderPath.slice(idx + 1) : folderPath;
  return last.trim();
}

interface BuildNode {
  coord: LatLng;
  edges: { lineId: number; dir: 1 | -1 }[];
}

interface BuildLine {
  name: string;
  coords: LatLng[];
  nodeStart: number;
  nodeEnd: number;
}

function buildCablesFromGroup(
  lines: CableLineInput[],
  folderShort: string,
): Omit<BuiltCable, 'id'>[] {
  const nodes: BuildNode[] = [];
  const linesInfo = new Map<number, BuildLine>();

  const nodeOf = (latlng: LatLng): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (distKm(nodes[i].coord, latlng) < SPAN_JOIN_KM) return i;
    }
    nodes.push({ coord: latlng, edges: [] });
    return nodes.length - 1;
  };

  for (const line of lines) {
    const coords = line.coordinates.map(([lng, lat]) => [lat, lng] as LatLng);
    const s = nodeOf(coords[0]);
    const e = nodeOf(coords[coords.length - 1]);
    linesInfo.set(line.id, { name: line.name, coords, nodeStart: s, nodeEnd: e });
    nodes[s].edges.push({ lineId: line.id, dir: 1 });
    nodes[e].edges.push({ lineId: line.id, dir: -1 });
  }

  const used = new Set<number>();
  const cables: Omit<BuiltCable, 'id'>[] = [];

  const appendLineCoords = (acc: LatLng[], lineCoords: LatLng[]) => {
    if (acc.length === 0) {
      acc.push(...lineCoords);
      return;
    }
    const last = acc[acc.length - 1];
    // junction sudah dipastikan < toleransi oleh node matching; buang duplikat
    if (distKm(last, lineCoords[0]) < SPAN_JOIN_KM) acc.push(...lineCoords.slice(1));
    else acc.push(...lineCoords);
  };

  const walkFrom = (nodeIdx: number, startEdge: { lineId: number; dir: 1 | -1 }) => {
    const acc: LatLng[] = [];
    const names: string[] = [];
    let cur = nodeIdx;
    let edge = startEdge;
    while (edge && !used.has(edge.lineId)) {
      const info = linesInfo.get(edge.lineId)!;
      appendLineCoords(acc, edge.dir === 1 ? info.coords : [...info.coords].reverse());
      names.push(info.name);
      used.add(edge.lineId);
      const nextIdx = edge.dir === 1 ? info.nodeEnd : info.nodeStart;
      if (nextIdx === cur) break; // self-loop
      cur = nextIdx;
      const nextNode = nodes[cur];
      if (nextNode.edges.length > 2) break; // titik cabang: kabel berhenti di sini
      const next = nextNode.edges.find(
        (x) => x.lineId !== edge.lineId && !used.has(x.lineId),
      );
      if (!next) break; // ujung mati
      edge = next;
    }
    if (names.length === 0) return;
    const name =
      names.length === 1
        ? names[0]
        : `${longestCommonPrefix(names.map(cableBaseName))} · ${folderShort}`;
    cables.push({ name, coords: acc });
  };

  // 1) dari setiap ujung mati (derajat 1)
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].edges.length === 1) walkFrom(i, nodes[i].edges[0]);
  }
  // 2) dari setiap edge tak terpakai yang menempel ke titik cabang
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.edges.length <= 2) continue;
    for (const e of node.edges) if (!used.has(e.lineId)) walkFrom(i, e);
  }
  // 3) sisa (rantai melingkar / terlewat)
  for (const line of lines) {
    if (used.has(line.id)) continue;
    const info = linesInfo.get(line.id)!;
    const e = nodes[info.nodeStart].edges.find((x) => x.lineId === line.id)!;
    walkFrom(info.nodeStart, e);
  }

  return cables;
}

/**
 * Menggabungkan span LineString KML menjadi kabel utuh.
 *
 * Strategi:
 * - Kelompokkan per sublayer (folder KML = satu lengan distribusi).
 * - Ujung span yang berdekatan (<= SPAN_JOIN_TOLERANCE_M) dianggap tersambung.
 * - Node berderajat > 2 = titik cabang; kabel fisik tidak boleh bercabang,
 *   sehingga rantai maksimal yang tidak melewati node cabang menjadi satu kabel.
 * - Span yang benar-benar terisolasi tetap menjadi kabel sendiri (perilaku lama).
 */
export function buildCablesFromLines(lines: CableLineInput[]): BuiltCable[] {
  const groups = new Map<number, CableLineInput[]>();
  for (const line of lines) {
    if (!line.coordinates || line.coordinates.length < 2) continue;
    const arr = groups.get(line.sublayerId) ?? [];
    arr.push(line);
    groups.set(line.sublayerId, arr);
  }

  const out: Omit<BuiltCable, 'id'>[] = [];
  for (const groupLines of groups.values()) {
    out.push(...buildCablesFromGroup(groupLines, folderShortName(groupLines[0].folderPath)));
  }
  return out.map((c, i) => ({ ...c, id: i }));
}
