const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

export interface ReverseGeocodeResult {
  displayName: string;
  road: string | null;
  houseNumber: string | null;
  village: string | null;
  suburb: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
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
    const district =
      typeof addr.district === 'string'
        ? addr.district
        : typeof addr.county === 'string'
          ? addr.county
          : null;
    const city =
      typeof addr.city === 'string'
        ? addr.city
        : typeof addr.municipality === 'string'
          ? addr.municipality
          : null;
    const state =
      typeof addr.state === 'string'
        ? addr.state
        : typeof addr.state_district === 'string'
          ? addr.state_district
          : null;
    const postcode = typeof addr.postcode === 'string' ? addr.postcode : null;

    return {
      displayName: data.display_name,
      road,
      houseNumber,
      village,
      suburb,
      district,
      city,
      state,
      postcode,
    };
  } catch {
    return null;
  }
}

function uniq(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const v = (part ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function formatAddressSuggestion(r: ReverseGeocodeResult): string {
  const base = [r.village, r.suburb, r.district, r.city, r.state, r.postcode];
  if (r.road) {
    return uniq([
      r.houseNumber ? `${r.road} No. ${r.houseNumber}` : r.road,
      ...base,
    ]).join(', ');
  }
  const draft = uniq(base);
  if (draft.length >= 2) return draft.join(', ');
  return r.displayName.replace(/, Indonesia$/i, '');
}