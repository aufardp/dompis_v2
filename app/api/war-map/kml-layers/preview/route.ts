export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseKml } from '@/app/libs/kml/parser';
import type { KmlParsedFeature } from '@/app/libs/kml/parser';

const MAX_PREVIEW_ROWS = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-preview',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (file.size > MAX_FILE_SIZE)
      throw new ApiError(400, 'File terlalu besar (maks 20MB)');

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'kml') throw new ApiError(400, 'Format file harus .kml');

    const xmlText = await file.text();
    if (!xmlText.trim()) throw new ApiError(400, 'File KML kosong');

    const result = parseKml(xmlText);

    return NextResponse.json({
      success: true,
      data: {
        title: result.title,
        original_filename: file.name,
        file_size_bytes: file.size,
        total_placemarks: result.totalPlacemarks,
        total_parsed: result.parsedCount,
        total_skipped: result.skippedCount,
        bbox: result.bbox,
        sublayers: result.sublayers.map((s) => ({
          folder_path: s.folderPath,
          geometry_kind: s.geometryKind,
          feature_count: s.featureCount,
          sample: s.sample.map((f) => toPreviewFeature(f)),
        })),
        warnings: result.warnings,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal preview file KML'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}

function toPreviewFeature(f: KmlParsedFeature) {
  return {
    name: f.name,
    feature_type: f.featureType,
    folder_path: f.folderPath,
    description_raw: f.descriptionRaw,
    parsed_metadata: f.parsedMetadata,
    latitude: f.latitude,
    longitude: f.longitude,
  };
}
