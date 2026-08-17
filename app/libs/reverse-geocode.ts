const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

export interface ReverseGeocodeResult {
  displayName: string;
  road: string | null;
  houseNumber: string | null;
  village: string | null;
  suburb: string | null;
  city: string | null;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    'accept-language': 'id',
    'email': 'dompis@solusee.id',
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data.display_name !== 'string') return null;

    const addr = data.address ?? {};
    const road = typeof addr.road === 'string' ? addr.road : null;
    const houseNumber =
      typeof addr.house_number === 'string' ? addr.house_number : null;
    const village =
      typeof addr.village === 'string'
        ? addr.village
        : typeof addr.neighbourhood === 'string'
          ? addr.neighbourhood
          : null;
    const suburb =
      typeof addr.suburb === 'string'
        ? addr.suburb
        : typeof addr.town === 'string'
          ? addr.town
          : null;
    const city =
      typeof addr.city === 'string'
        ? addr.city
        : typeof addr.municipality === 'string'
          ? addr.municipality
          : null;

    return { displayName: data.display_name, road, houseNumber, village, suburb, city };
  } catch {
    return null;
  }
}

export function formatAddressSuggestion(r: ReverseGeocodeResult): string {
  const parts: string[] = [];
  if (r.road) parts.push(r.houseNumber ? `${r.road} No. ${r.houseNumber}` : r.road);
  if (r.village) parts.push(r.village);
  if (r.suburb && r.suburb !== r.village) parts.push(r.suburb);
  if (r.city) parts.push(r.city);
  return parts.filter(Boolean).join(', ') || r.displayName;
}