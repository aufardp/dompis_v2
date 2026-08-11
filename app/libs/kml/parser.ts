import { XMLParser } from 'fast-xml-parser';

/**
 * Parser KML server-side (Node runtime).
 *
 * Desain mengikuti PRD-War-Map-KML-Import-Layer §1.2 / §7.2:
 * - Struktur folder dipertahankan (Document → Folder → Placemark) untuk
 *   membentuk `kml_sublayer` yang bisa di-toggle sesuai judul folder.
 * - Dual-mode description: regex `key : value` untuk LineString (kabel),
 *   simpan mentah untuk Point (ODC/ODP) tanpa asumsi format.
 * - XXE-safe: DOCTYPE/ENTITY diblokir eksplisit sebelum parsing.
 */

export type KmlGeometryKind = 'point' | 'line';

export type KmlIconKey = 'star' | 'pushpin' | 'dot' | 'square' | 'triangle' | null;

export interface KmlParsedFeature {
  name: string;
  featureType: KmlGeometryKind;
  folderPath: string; // breadcrumb "ODP > D.01"
  sublayerFolderPath: string; // folder yang jadi sublayer (level 1 atau 2)
  descriptionRaw: string | null;
  parsedMetadata: Record<string, string> | null; // HANYA utk line
  latitude: number | null;
  longitude: number | null;
  pathCoordinates: [number, number][] | null; // [[lng,lat], ...]
  warning: string | null; // alasan di-skip kalau geometri tidak valid
  // Styling asli KML (preservasi penuh, PRD §9.4)
  styleUrlId: string | null;
  lineColorHex: string | null; // #rrggbb dari LineStyle.color
  lineWidth: number | null; // LineStyle.width
  iconKey: KmlIconKey; // dari IconStyle.Icon.href
  iconColorHex: string | null; // #rrggbb tint dari IconStyle.color
  iconScale: number | null; // IconStyle.scale
  nodeRole: 'odc' | 'odp' | 'tiang' | null; // peran node jaringan (M4)
}

/** Infer peran node dari nama sublayer (level 2) — ODC/ODP/TIANG (PRD §H/M4). */
export function inferNodeRole(
  sublayerFolderPath: string,
): 'odc' | 'odp' | 'tiang' | null {
  if (/^ODC\b/i.test(sublayerFolderPath)) return 'odc';
  if (/^ODP\b/i.test(sublayerFolderPath)) return 'odp';
  if (/^TIANG\b/i.test(sublayerFolderPath)) return 'tiang';
  return null;
}

export interface KmlParsedSublayer {
  folderPath: string; // top-level folder (mis. "ODP", "DISTRIBUSI")
  geometryKind: KmlGeometryKind;
  featureCount: number;
  sample: KmlParsedFeature[];
}

export interface KmlParseResult {
  title: string;
  sublayers: KmlParsedSublayer[];
  features: KmlParsedFeature[];
  bbox: { south: number; west: number; north: number; east: number } | null;
  totalPlacemarks: number;
  parsedCount: number;
  skippedCount: number;
  warnings: string[];
}

interface KmlStyleEntry {
  styleUrlId: string | null;
  lineColorHex: string | null; // #rrggbb
  lineWidth: number | null;
  iconKey: KmlIconKey;
  iconColorHex: string | null; // #rrggbb tint
  iconScale: number | null;
}

interface KmlStyleRaw {
  lineColor: string | null; // format KML aabbggrr
  lineWidth: number | null;
  iconHref: string | null;
  iconColor: string | null; // format KML aabbggrr (tint)
  iconScale: number | null;
}

const ICON_KEY_RE: Array<[RegExp, NonNullable<KmlIconKey>]> = [
  [/star/i, 'star'],
  [/pushpin/i, 'pushpin'],
  [/triangle/i, 'triangle'],
  [/square/i, 'square'],
  [/shaded[_\-]?dot/i, 'dot'],
];

const EMPTY_STYLE: KmlStyleEntry = {
  styleUrlId: null,
  lineColorHex: null,
  lineWidth: null,
  iconKey: null,
  iconColorHex: null,
  iconScale: null,
};

/**
 * Bangun resolver styleUrl → style (LineStyle + IconStyle), menangani StyleMap.
 * Reference via #id: jika StyleMap → pakai Pair normal → Style.
 */
function buildStyleResolver(documentNode: any): (styleUrl: unknown) => KmlStyleEntry {
  const rawStyles = new Map<string, KmlStyleRaw>();
  for (const s of toArray(documentNode.Style)) {
    const id = readName(s['@_id']);
    if (!id) continue;
    const line = s?.LineStyle;
    const icon = s?.IconStyle;
    rawStyles.set(id, {
      lineColor: typeof line?.color === 'string' ? line.color : null,
      lineWidth:
        line?.width !== undefined
          ? Number(line.width) || null
          : null,
      iconHref:
        typeof icon?.Icon?.href === 'string' ? icon.Icon.href : null,
      iconColor: typeof icon?.color === 'string' ? icon.color : null,
      iconScale:
        icon?.scale !== undefined ? Number(icon.scale) || null : null,
    });
  }

  // StyleMap: id → id Style normal
  const styleMapNormal = new Map<string, string>();
  for (const sm of toArray(documentNode.StyleMap)) {
    const id = readName(sm['@_id']);
    if (!id) continue;
    for (const pair of toArray(sm.Pair)) {
      if (readName(pair.key) === 'normal') {
        const target = readName(pair.styleUrl).replace(/^#/, '');
        if (target) styleMapNormal.set(id, target);
      }
    }
  }

  const resolveRaw = (styleUrl: unknown): { id: string; raw: KmlStyleRaw | null } => {
    const url = readName(styleUrl).replace(/^#/, '');
    if (!url) return { id: '', raw: null };
    const direct = rawStyles.get(url);
    if (direct) return { id: url, raw: direct };
    const mapped = styleMapNormal.get(url);
    if (mapped) {
      const raw = rawStyles.get(mapped);
      if (raw) return { id: mapped, raw };
    }
    return { id: url, raw: null };
  };

  return (styleUrl: unknown): KmlStyleEntry => {
    const { id, raw } = resolveRaw(styleUrl);
    if (!raw) return { ...EMPTY_STYLE, styleUrlId: id };
    const href = raw.iconHref;
    let iconKey: KmlIconKey = null;
    if (href) {
      const base = href.split('/').pop() ?? '';
      const match = ICON_KEY_RE.find(([re]) => re.test(base));
      iconKey = match ? match[1] : null;
    }
    // Warna final = base (dari nama file) + tint IconStyle.color (PRD §A2)
    const baseColor = iconBaseColorHex(href);
    const iconColorHex = baseColor
      ? applyKmlTint(baseColor, raw.iconColor) ?? baseColor
      : raw.iconColor
        ? kmlColorToHex(raw.iconColor)
        : null;
    return {
      styleUrlId: id,
      lineColorHex: raw.lineColor ? kmlColorToHex(raw.lineColor) : null,
      lineWidth: raw.lineWidth,
      iconKey,
      iconColorHex,
      iconScale: raw.iconScale,
    };
  };
}

/** Konversi warna KML (aabbggrr) → hex #rrggbb. */
export function kmlColorToHex(kmlColor: string): string | null {
  const cleaned = kmlColor.trim();
  if (!/^[0-9a-fA-F]{8}$/.test(cleaned)) return null;
  const bb = cleaned.slice(2, 4);
  const gg = cleaned.slice(4, 6);
  const rr = cleaned.slice(6, 8);
  return `#${rr}${gg}${bb}`.toLowerCase();
}

/**
 * Warna dasar ikon kode-kan di NAMA FILE href Google (PRD §A2).
 * `IconStyle.color` hanyalah TINT perkalian — untuk base tanpa tint,
 * warna asli diambil dari prefiks nama file (grn/wht/ylw/shaded_dot).
 */
export function iconBaseColorHex(href: string | null): string | null {
  if (!href) return null;
  const base = href.split('/').pop() ?? '';
  if (/^grn-stars/i.test(base)) return '#34a853';
  if (/^wht-stars/i.test(base)) return '#ffffff';
  if (/^ylw-pushpin/i.test(base)) return '#fbc04d';
  if (/^shaded[_\-]?dot/i.test(base)) return '#555555';
  if (/^square/i.test(base)) return '#b3a1e6';
  if (/^triangle/i.test(base)) return '#e1b53e';
  if (/star/i.test(base)) return '#ffffff';
  if (/pushpin/i.test(base)) return '#fbc04d';
  return null;
}

/**
 * Terapkan tint KML (IconStyle.color) ke warna dasar ikon via perkalian
 * channel-wise — meniru perilaku Google Earth. Tint netral `ffffffff`
 * diabaikan; tint hitam `ff000000` menggelapkan (×0.55) bukan jadi hitam pekat.
 */
export function applyKmlTint(
  baseHex: string | null,
  tintKmlColor: string | null,
): string | null {
  if (!baseHex) return null;
  if (!tintKmlColor) return baseHex;
  const tint = kmlColorToHex(tintKmlColor);
  if (!tint) return baseHex;
  const t = tint.toLowerCase();
  if (t === '#ffffff') return baseHex;

  const base = baseHex.toLowerCase();
  const baseChannels = [
    parseInt(base.slice(1, 3), 16),
    parseInt(base.slice(3, 5), 16),
    parseInt(base.slice(5, 7), 16),
  ];

  const mix = (bi: number, ti: number): number =>
    Math.round(
      (parseInt(base.slice(bi, bi + 2), 16) * parseInt(t.slice(ti, ti + 2), 16)) /
        255,
    );

  // Tint hitam (`ff000000`) = GELAPKAN ikon, bukan kalikan dengan 0 (hitam pekat).
  // Meniru Google Earth yang menggelapkan ikon grayscale (mis. shaded_dot).
  if (t === '#000000') {
    const darken = (c: number) => Math.round(c * 0.55);
    const [r, g, b] = baseChannels.map(darken);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  const r = mix(1, 1);
  const g = mix(3, 3);
  const b = mix(5, 5);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const KEY_VALUE_RE = /^\s*([^:\n]{1,80})\s*:\s*(.+?)\s*$/;

const XML_DECL_ENTITY_BLOCK = /<!DOCTYPE|<!ENTITY/i;

const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  stopNodes: [],
};

/**
 * Parse teks KML menjadi struktur layer/sublayer/feature.
 * Lempar error (status 400) untuk konten bukan XML valid / DOCTYPE.
 */
export function parseKml(xmlText: string): KmlParseResult {
  if (!xmlText || !xmlText.trim()) {
    throw new Error('File KML kosong');
  }
  if (XML_DECL_ENTITY_BLOCK.test(xmlText)) {
    throw new Error(
      'File KML tidak valid: DOCTYPE/ENTITY tidak diizinkan (keamanan XXE)',
    );
  }

  let doc: any;
  try {
    const parser = new XMLParser(PARSER_OPTS);
    doc = parser.parse(xmlText);
  } catch (error: any) {
    throw new Error(
      `File bukan XML valid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const kmlRoot = doc?.kml;
  if (!kmlRoot) {
    throw new Error('File KML tidak valid: elemen <kml> tidak ditemukan');
  }

  const documentNode = kmlRoot.Document ?? kmlRoot;
  const docName = readName(documentNode.name);

  const styleResolver = buildStyleResolver(documentNode);

  const features: KmlParsedFeature[] = [];
  const warnings: string[] = [];
  let totalPlacemarks = 0;

  const folders = toArray(documentNode.Folder);

  // Google Earth export sering membungkus SEMUA subfolder dalam satu folder
  // root yang namanya = nama file (mis. "ODC-RKT-FKT" > ODP/DISTRIBUSI/...).
  // Kalau cuma ada SATU top-level folder dan dia berisi subfolder, perlakukan
  // dia sebagai wrapper dan kelompokkan sublayer dari level kedua — kalau
  // tidak, grouping dari level pertama.
  const isWrapper =
    folders.length === 1 && toArray(folders[0].Folder).length > 0;

  const sublayerKey = (breadcrumb: string[]): string => {
    const parts = breadcrumb.filter(Boolean);
    if (isWrapper) {
      return parts.length > 1 ? parts[1] : parts[0];
    }
    return parts[0] ?? '(Tanpa Nama)';
  };

  if (folders.length === 0) {
    // Placemark langsung di bawah Document (tanpa Folder)
    collectFolderFeatures(
      documentNode,
      docName,
      features,
      warnings,
      () => {
        totalPlacemarks++;
      },
      styleResolver,
    );
  } else {
    // Placemark yang langsung berada di bawah Document (di luar Folder mana pun)
    const directPlacemarks = toArray(documentNode.Placemark);
    for (const pm of directPlacemarks) {
      totalPlacemarks++;
      features.push(
        parsePlacemark(pm, [docName], sublayerKey([docName]), styleResolver, warnings),
      );
    }

    for (const folder of folders) {
      const folderName = readName(folder.name) || '(Tanpa Nama)';
      collectFolderFeatures(
        folder,
        folderName,
        features,
        warnings,
        () => {
          totalPlacemarks++;
        },
        styleResolver,
        [folderName],
        (breadcrumb) => sublayerKey(breadcrumb),
      );
    }
  }

  const parsed = features.filter((f) => f.warning === null);
  const skipped = features.filter((f) => f.warning !== null);

  const sublayerMap = new Map<
    string,
    KmlParsedSublayer & { pointCount: number; lineCount: number }
  >();
  for (const feature of parsed) {
    const key = feature.sublayerFolderPath || '(Tanpa Nama)';
    let sub = sublayerMap.get(key);
    if (!sub) {
      sub = {
        folderPath: key,
        geometryKind: feature.featureType,
        featureCount: 0,
        pointCount: 0,
        lineCount: 0,
        sample: [],
      };
      sublayerMap.set(key, sub);
    }
    if (feature.featureType === 'point') sub.pointCount++;
    else sub.lineCount++;
    if (sub.featureCount < 5) sub.sample.push(feature);
    sub.featureCount++;
  }

  // Folder campuran: geometryKind dipakai utk ikon sublayer — ambil yang dominan
  const sublayers = [...sublayerMap.values()]
    .map((sub) => {
      sub.geometryKind = sub.lineCount > sub.pointCount ? 'line' : 'point';
      const { pointCount: _p, lineCount: _l, ...rest } = sub;
      return rest;
    })
    .sort((a, b) => {
      if (a.geometryKind !== b.geometryKind) {
        return a.geometryKind === 'point' ? -1 : 1;
      }
      return a.folderPath.localeCompare(b.folderPath);
    });

  for (const w of skipped) {
    warnings.push(
      `Placemark "${w.name}" dilewati: ${w.warning} (${w.folderPath})`,
    );
  }

  return {
    title: docName,
    sublayers,
    features: parsed,
    bbox: computeBbox(parsed),
    totalPlacemarks,
    parsedCount: parsed.length,
    skippedCount: skipped.length,
    warnings,
  };
}

function collectFolderFeatures(
  node: any,
  folderPath: string,
  features: KmlParsedFeature[],
  warnings: string[],
  onPlacemark: () => void,
  styleResolver: (styleUrl: unknown) => KmlStyleEntry,
  breadcrumb: string[] = [],
  sublayerKey?: (breadcrumb: string[]) => string,
) {
  const placemarks = toArray(node.Placemark);
  for (const pm of placemarks) {
    onPlacemark();
    features.push(
      parsePlacemark(pm, breadcrumb, sublayerKey?.(breadcrumb) ?? '', styleResolver, warnings),
    );
  }

  const subFolders = toArray(node.Folder);
  for (const sub of subFolders) {
    const subName = readName(sub.name) || '(Tanpa Nama)';
    collectFolderFeatures(
      sub,
      folderPath,
      features,
      warnings,
      onPlacemark,
      styleResolver,
      [...breadcrumb, subName],
      sublayerKey,
    );
  }
}

function parsePlacemark(
  pm: any,
  breadcrumb: string[],
  sublayerFolderPath: string,
  styleResolver: (styleUrl: unknown) => KmlStyleEntry,
  warnings: string[],
): KmlParsedFeature {
  const name = readName(pm.name) || '(Tanpa Nama)';
  const folderPath = breadcrumb.join(' > ') || '(Root)';
  const descriptionRaw = typeof pm.description === 'string' ? pm.description.trim() : null;

  const style = styleResolver(pm.styleUrl);

  if (pm.Point) {
    const coords = parsePointCoords(pm.Point.coordinates);
    if (!coords) {
      return {
        name,
        featureType: 'point',
        folderPath,
        sublayerFolderPath,
        descriptionRaw,
        parsedMetadata: null,
        latitude: null,
        longitude: null,
        pathCoordinates: null,
        warning: 'koordinat Point tidak valid',
        styleUrlId: style.styleUrlId,
        lineColorHex: null,
        lineWidth: null,
        iconKey: style.iconKey,
        iconColorHex: style.iconColorHex,
        iconScale: style.iconScale,
        nodeRole: inferNodeRole(sublayerFolderPath),
      };
    }
    return {
      name,
      featureType: 'point',
      folderPath,
      sublayerFolderPath,
      descriptionRaw,
      parsedMetadata: null,
      latitude: coords[1],
      longitude: coords[0],
      pathCoordinates: null,
      warning: null,
      styleUrlId: style.styleUrlId,
      lineColorHex: null,
      lineWidth: null,
      iconKey: style.iconKey,
      iconColorHex: style.iconColorHex,
      iconScale: style.iconScale,
      nodeRole: inferNodeRole(sublayerFolderPath),
    };
  }

  if (pm.LineString) {
    const coords = parseLineCoords(pm.LineString.coordinates);
    if (!coords || coords.length < 2) {
      return {
        name,
        featureType: 'line',
        folderPath,
        sublayerFolderPath,
        descriptionRaw,
        parsedMetadata: null,
        latitude: null,
        longitude: null,
        pathCoordinates: null,
        warning: 'koordinat LineString tidak valid (butuh minimal 2 titik)',
        styleUrlId: style.styleUrlId,
        lineColorHex: style.lineColorHex,
        lineWidth: style.lineWidth,
        iconKey: null,
        iconColorHex: null,
        iconScale: null,
        nodeRole: null,
      };
    }
    return {
      name,
      featureType: 'line',
      folderPath,
      sublayerFolderPath,
      descriptionRaw,
      parsedMetadata: parseKeyValueDescription(descriptionRaw),
      latitude: null,
      longitude: null,
      pathCoordinates: coords,
      warning: null,
      styleUrlId: style.styleUrlId,
      lineColorHex: style.lineColorHex,
      lineWidth: style.lineWidth,
      iconKey: null,
      iconColorHex: null,
      iconScale: null,
      nodeRole: null,
    };
  }

  return {
    name,
    featureType: 'point',
    folderPath,
    sublayerFolderPath,
    descriptionRaw,
    parsedMetadata: null,
    latitude: null,
    longitude: null,
    pathCoordinates: null,
    warning: 'Placemark tanpa geometri Point/LineString',
    styleUrlId: style.styleUrlId,
    lineColorHex: null,
    lineWidth: null,
    iconKey: null,
    iconColorHex: null,
    iconScale: null,
    nodeRole: null,
  };
}

/** KML Point: "lng,lat[,alt]" */
function parsePointCoords(raw: unknown): [number, number] | null {
  if (typeof raw !== 'string') return null;
  const [lngRaw, latRaw] = raw.split(',');
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

/** KML LineString: "lng,lat[,alt] lng,lat[,alt] ..." dipisah spasi/newline */
function parseLineCoords(raw: unknown): [number, number][] | null {
  if (typeof raw !== 'string') return null;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const coords: [number, number][] = [];
  for (const token of tokens) {
    const [lngRaw, latRaw] = token.split(',');
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    coords.push([lng, lat]);
  }
  return coords.length > 0 ? coords : null;
}

/** Parse description kabel format "Key : Value" per baris (PRD §1.2) */
export function parseKeyValueDescription(
  description: string | null,
): Record<string, string> | null {
  if (!description) return null;
  const lines = description.split(/\r?\n/);
  const result: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(KEY_VALUE_RE);
    if (!match) continue;
    const [, key, value] = match;
    result[key.trim()] = value.trim();
  }
  return Object.keys(result).length > 0 ? result : null;
}

function computeBbox(
  features: KmlParsedFeature[],
): { south: number; west: number; north: number; east: number } | null {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;

  for (const f of features) {
    if (f.featureType === 'point' && f.latitude !== null && f.longitude !== null) {
      minLat = Math.min(minLat, f.latitude);
      maxLat = Math.max(maxLat, f.latitude);
      minLng = Math.min(minLng, f.longitude);
      maxLng = Math.max(maxLng, f.longitude);
    } else if (f.featureType === 'line' && f.pathCoordinates) {
      for (const [lng, lat] of f.pathCoordinates) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }
    }
  }

  if (!Number.isFinite(minLat)) return null;
  return { south: minLat, west: minLng, north: maxLat, east: maxLng };
}

function readName(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toArray(value: unknown): any[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
