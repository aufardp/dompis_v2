export type OdpAlertTier = 'critical' | 'warning';

export interface OdpNearbyPoint {
  serviceNo: string;
  customerName: string | null;
  distanceKm: number;
  status: string | null;
  incident: string | null;
}

/**
 * Normalisasi nama ODP / device_name: ambil segmen sebelum spasi pertama
 * lalu uppercase. Contoh: "ODP-RKT-FKT/01 SML/D02/11.02" → "ODP-RKT-FKT/01".
 */
export function odpToken(value: string): string {
  return value.trim().split(/\s+/)[0].toUpperCase();
}

/**
 * Apakah device_name (ODP dari sejarah/service_location) milik memberi ODP.
 * Match token sebelum spasi, case-insensitive (format Nossa).
 */
export function odpMatches(deviceName: string | null | undefined, odpName: string): boolean {
  if (!deviceName || !deviceName.trim()) return false;
  return odpToken(deviceName) === odpToken(odpName);
}

export interface OdpPointLike {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * ODP terdekat dari koordinat acuan (mis. lokasi user). Mengembalikan
 * `null` bila tidak ada ODP sama sekali. Dipakai tombol "Lihat jaringan"
 * untuk memusat peta ke jaringan/ODP terdekat lokasi pengguna.
 */
export function nearestOdp(
  ref: { latitude: number; longitude: number },
  odpPoints: OdpPointLike[],
): { odp: OdpPointLike; distKm: number } | null {
  let best: OdpPointLike | null = null;
  let bestDist = Infinity;
  for (const odp of odpPoints) {
    const d = haversineKm(
      ref.latitude,
      ref.longitude,
      odp.latitude,
      odp.longitude,
    );
    if (d < bestDist) {
      bestDist = d;
      best = odp;
    }
  }
  return best ? { odp: best, distKm: bestDist } : null;
}

export interface OdpAlert {
  odpId: number;
  name: string;
  latitude: number;
  longitude: number;
  tier: OdpAlertTier;
  totalPoints: number;
  activeCount: number;
  hotCount: number;
  nearby: OdpNearbyPoint[];
  attributed: OdpNearbyPoint[];
}

export interface OdpAlertOptions {
  radiusKm: number;
  criticalCount: number;
  warnCount: number;
}

export const DEFAULT_ODP_ALERT_OPTIONS: OdpAlertOptions = {
  radiusKm: 1,
  criticalCount: 6,
  warnCount: 4,
};

const EARTH_RADIUS_KM = 6371;
const ACTIVE_STATUSES = new Set(['open', 'assigned', 'on_progress', 'pending']);

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

export interface DisturbancePointLike extends OdpPointLike {
  serviceNo: string;
  customerName: string | null;
  deviceName: string | null;
  isHot: boolean;
  historyCount60d: number;
  lastTicket: {
    statusUpdate: string | null;
    incident: string | null;
  } | null;
}

/**
 * Hitung alert ODP berdasarkan jumlah TIKET unik (service_no) gangguan.
 * - total >= criticalCount  → BERISIKO (critical)
 * - total >= warnCount      → WASPADA (warning)
 * - selain itu              → tanpa alert
 *
 * Satu service_no dihitung satu kali. Sebuah titik dianggap milik ODP jika:
 *   - berada dalam `radiusKm` (nearby), DAN/ATAU
 *   - `deviceName`-nya match nama ODP (`odpMatches`) → attributed,
 *     dimasukkan ke daftar ODP meski di luar radius.
 * `totalPoints` = gabungan unik attributed ∪ nearby (model war map:
 * 1 titik = 1 service_no).
 */
export function computeOdpAlerts(
  odpPoints: OdpPointLike[],
  points: DisturbancePointLike[],
  options: OdpAlertOptions = DEFAULT_ODP_ALERT_OPTIONS,
): OdpAlert[] {
  const { radiusKm, criticalCount, warnCount } = options;
  const alerts: OdpAlert[] = [];

  // Token nama ODP/device_name disiapkan SEKALI (per ODP & per gangguan),
  // bukan dihitung ulang per pasangan (perf — dataset bisa ribuan titik).
  const odpNameTokens = odpPoints.map((o) => odpToken(o.name));
  const disturbanceTokens = points.map((p) => odpToken(p.deviceName ?? ''));

  for (let oi = 0; oi < odpPoints.length; oi++) {
    const odp = odpPoints[oi];
    const odpNameToken = odpNameTokens[oi];
    const nearby: OdpNearbyPoint[] = [];
    const attributed: OdpNearbyPoint[] = [];
    const seenServiceNo = new Set<string>();
    let activeCount = 0;
    let hotCount = 0;

    for (let pi = 0; pi < points.length; pi++) {
      const p = points[pi];
      if (seenServiceNo.has(p.serviceNo)) continue;
      const inAttribution =
        disturbanceTokens[pi].length > 0 &&
        disturbanceTokens[pi] === odpNameToken;
      const dLat = Math.abs(p.latitude - odp.latitude);
      const dLng = Math.abs(p.longitude - odp.longitude);
      // Prefilter kotak-batas kasar sebelum haversine (perf)
      const rough = Math.max(dLat * 111, dLng * 111 * Math.cos((odp.latitude * Math.PI) / 180));
      const inRadius = rough <= radiusKm && haversineKm(odp.latitude, odp.longitude, p.latitude, p.longitude) <= radiusKm;

      if (!inAttribution && !inRadius) continue;

      seenServiceNo.add(p.serviceNo);
      const dist = haversineKm(odp.latitude, odp.longitude, p.latitude, p.longitude);
      const active = p.lastTicket ? ACTIVE_STATUSES.has(p.lastTicket.statusUpdate ?? '') : false;
      const hot = p.isHot || p.historyCount60d >= 3;
      if (active) activeCount++;
      if (hot) hotCount++;
      const entry: OdpNearbyPoint = {
        serviceNo: p.serviceNo,
        customerName: p.customerName,
        distanceKm: Math.round(dist * 1000) / 1000,
        status: p.lastTicket?.statusUpdate ?? null,
        incident: p.lastTicket?.incident ?? null,
      };
      if (inRadius) nearby.push(entry);
      if (inAttribution) attributed.push(entry);
    }

    const totalPoints = seenServiceNo.size;
    if (totalPoints < warnCount) continue;
    alerts.push({
      odpId: odp.id,
      name: odp.name,
      latitude: odp.latitude,
      longitude: odp.longitude,
      tier: totalPoints >= criticalCount ? 'critical' : 'warning',
      totalPoints,
      activeCount,
      hotCount,
      nearby: nearby.sort((a, b) => a.distanceKm - b.distanceKm),
      attributed: attributed.sort((a, b) => a.distanceKm - b.distanceKm),
    });
  }

  return alerts.sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      (a.tier === b.tier ? 0 : a.tier === 'critical' ? -1 : 1),
  );
}