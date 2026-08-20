export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getOrSetCache } from '@/lib/cache';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

const CACHE_TTL = 300; // 5 menit — data KML jarang berubah
const WAR_MAP_ROLES = [
  'admin',
  'helpdesk',
  'superadmin',
  'super_admin',
  'senior_leader',
  'admin_branch',
  'teknisi',
];

type Bbox = { south: number; west: number; north: number; east: number };

function splitList(value: string | null): number[] {
  if (!value || !value.trim()) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v)),
    ),
  ];
}

function parseBbox(value: string | null): Bbox | null {
  const parts = (value ?? '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));
  if (parts.length < 4) return null;
  const [south, west, north, east] = parts;
  if (![south, west, north, east].every((v) => Number.isFinite(v))) return null;
  return { south, west, north, east };
}

// Padding proporsional + minimal agar marker di tepi viewport tidak terpotong.
function paddedBbox(bbox: Bbox): Bbox {
  const latPad = Math.max((bbox.north - bbox.south) * 0.2, 0.02);
  const lngPad = Math.max((bbox.east - bbox.west) * 0.2, 0.02);
  return {
    south: bbox.south - latPad,
    west: bbox.west - lngPad,
    north: bbox.north + latPad,
    east: bbox.east + lngPad,
  };
}

function bboxKey(bbox: Bbox): string {
  return [bbox.south, bbox.west, bbox.north, bbox.east]
    .map((v) => v.toFixed(4))
    .join(',');
}

// Apakah bounding box fitur memotong viewport (padding sudah termasuk).
function intersectsBbox(
  coords: [number, number][],
  bbox: Bbox,
): boolean {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return (
    minLng <= bbox.east &&
    maxLng >= bbox.west &&
    minLat <= bbox.north &&
    maxLat >= bbox.south
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-geojson',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(WAR_MAP_ROLES);

    const { id } = await params;
    const layerId = Number(id);
    if (!Number.isFinite(layerId) || layerId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid layer id' },
        { status: 400 },
      );
    }

    const { searchParams } = req.nextUrl;

    const sublayerIds = splitList(searchParams.get('sublayer'));
    const rawBbox = parseBbox(searchParams.get('bbox'));
    const bbox = rawBbox ? paddedBbox(rawBbox) : null;

    const layer = await prisma.kml_layer.findFirst({
      where: { id: layerId, status: 'active' },
      select: { id: true, workzone_tag: true },
    });
    if (!layer) {
      return NextResponse.json(
        { success: false, message: 'Layer tidak ditemukan' },
        { status: 404 },
      );
    }

    const isSuperAdmin = user.role === 'superadmin' || user.role === 'super_admin';
    if (!isSuperAdmin) {
      const workzones = await getWorkzonesForUser(user.id_user);
      if (
        workzones.length === 0 ||
        !layer.workzone_tag ||
        !workzones.includes(layer.workzone_tag)
      ) {
        return NextResponse.json(
          { success: false, message: 'Skema tidak ditemukan' },
          { status: 404 },
        );
      }
    }

    const cacheKey = [
      'war-map:kml:geojson:v4', // v4: culling bbox (titik/polyline) + padding
      layerId,
      sublayerIds.join(','),
      bbox ? bboxKey(bbox) : 'all',
    ].join('|');

    const data = await getOrSetCache(cacheKey, async () => {
      const where: any = { kml_layer_id: layerId };
      if (sublayerIds.length > 0) {
        where.kml_sublayer_id = { in: sublayerIds };
      }
      if (bbox) {
        // Titik langsung disaring di query (kotak-batas); polyline difilter di JS
        // karena koordinatnya JSON (perlu bounding-box). West>east (antimeridian)
        // tidak umum di wilayah kerja — fallback tak difilter longitude.
        if (bbox.west <= bbox.east) {
          where.longitude = { gte: bbox.west, lte: bbox.east };
        }
        where.latitude = { gte: bbox.south, lte: bbox.north };
      }

      const rows = await prisma.kml_feature.findMany({
        where,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          feature_type: true,
          folder_path: true,
          description_raw: true,
          parsed_metadata: true,
          style_color: true,
          line_color: true,
          line_width: true,
          icon_key: true,
          icon_color: true,
          icon_scale: true,
          node_role: true,
          latitude: true,
          longitude: true,
          path_coordinates: true,
          kml_sublayer_id: true,
        },
      });

      const features = rows
        .map((r) => {
          const props: any = {
            id: r.id,
            name: r.name,
            featureType: r.feature_type,
            folderPath: r.folder_path,
            descriptionRaw: r.description_raw,
            parsedMetadata: r.parsed_metadata as Record<string, string> | null,
            styleColor: r.style_color,
            lineColor: r.line_color,
            lineWidth: r.line_width,
            iconKey: r.icon_key,
            iconColor: r.icon_color,
            iconScale: r.icon_scale,
            nodeRole: r.node_role,
            sublayerId: r.kml_sublayer_id,
          };

          if (r.feature_type === 'point') {
            if (r.latitude === null || r.longitude === null) return null;
            return {
              type: 'Feature' as const,
              properties: props,
              geometry: {
                type: 'Point' as const,
                coordinates: [r.longitude.toNumber(), r.latitude.toNumber()],
              },
            };
          }

          const coords = (r.path_coordinates as [number, number][]) ?? null;
          if (!coords || coords.length < 2) return null;
          if (bbox && !intersectsBbox(coords, bbox)) return null;
          return {
            type: 'Feature' as const,
            properties: props,
            geometry: {
              type: 'LineString' as const,
              coordinates: coords,
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);

      return {
        type: 'FeatureCollection',
        features,
        meta: { total: features.length },
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 500) },
    );
  }
}
