export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseKml } from '@/app/libs/kml/parser';
import { saveKmlFile, deleteKmlFile } from '@/app/libs/kml/storage';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const BATCH_SIZE = 500;
const MAX_FEATURES = 50000;

export async function POST(req: Request) {
  let createdLayerId: number | null = null;
  try {
    const actor = await protectApi(['admin', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-run',
      limit: 5,
      windowSeconds: 120,
    });
    if (rateLimited) return rateLimited;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawTitle = (formData.get('title') as string | null) ?? '';
    const rawWorkzoneTag = (formData.get('workzone_tag') as string | null) ?? '';
    const rawSublayerVisibility = formData.get('sublayer_visibility') as string | null;

    if (!file) throw new ApiError(400, 'File tidak ditemukan');
    if (file.size > MAX_FILE_SIZE)
      throw new ApiError(400, 'File terlalu besar (maks 20MB)');

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'kml') throw new ApiError(400, 'Format file harus .kml');

    const title = rawTitle.trim().slice(0, 150) || file.name;
    const workzoneTag = rawWorkzoneTag.trim().toUpperCase().slice(0, 100);
    if (!workzoneTag) {
      throw new ApiError(400, 'Workzone wajib diisi');
    }
    const masterSas = await prisma.service_area.findMany({
      select: { nama_sa: true },
      distinct: ['nama_sa'],
    });
    const validWorkzones = new Set(
      masterSas
        .map((s) => (s.nama_sa ?? '').toUpperCase())
        .filter(Boolean),
    );
    if (!validWorkzones.has(workzoneTag)) {
      throw new ApiError(
        400,
        'Workzone tidak valid. Pilih salah satu dari daftar service area.',
      );
    }

    let sublayerVisibility: Record<string, boolean> = {};
    if (rawSublayerVisibility) {
      try {
        const parsed = JSON.parse(rawSublayerVisibility);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          sublayerVisibility = parsed;
        }
      } catch {
        // ignore — pakai default semua visible
      }
    }

    const xmlText = await file.text();
    if (!xmlText.trim()) throw new ApiError(400, 'File KML kosong');

    const result = parseKml(xmlText);
    if (result.parsedCount === 0) {
      throw new ApiError(400, 'File KML tidak mengandung fitur valid');
    }
    if (result.parsedCount > MAX_FEATURES) {
      throw new ApiError(413, `Terlalu banyak fitur (maks ${MAX_FEATURES.toLocaleString('id-ID')})`);
    }

    const pointCount = result.features.filter(
      (f) => f.featureType === 'point',
    ).length;
    const lineCount = result.features.filter(
      (f) => f.featureType === 'line',
    ).length;

    const layer = await prisma.kml_layer.create({
      data: {
        title,
        original_filename: file.name,
        file_size_bytes: file.size,
        storage_path: '',
        workzone_tag: workzoneTag,
        point_count: pointCount,
        line_count: lineCount,
        bbox_south: result.bbox?.south ?? null,
        bbox_west: result.bbox?.west ?? null,
        bbox_north: result.bbox?.north ?? null,
        bbox_east: result.bbox?.east ?? null,
        status: 'active',
        uploaded_by: actor.id_user,
      },
    });
    createdLayerId = layer.id;

    const storagePath = await saveKmlFile(layer.id, xmlText);
    await prisma.kml_layer.update({
      where: { id: layer.id },
      data: { storage_path: storagePath },
    });

    // Insert sublayers (urut per sublayer hasil parse)
    const sublayers = [];
    for (let index = 0; index < result.sublayers.length; index++) {
      const sub = result.sublayers[index];
      const sublayer = await prisma.kml_sublayer.create({
        data: {
          kml_layer_id: layer.id,
          folder_path: sub.folderPath,
          geometry_kind: sub.geometryKind,
          feature_count: sub.featureCount,
          default_visible: sublayerVisibility[sub.folderPath] !== false,
          display_order: index,
        },
      });
      sublayers.push(sublayer);
    }

    const sublayerIdByPath = new Map(
      sublayers.map((s) => [s.folder_path, s.id]),
    );

    // Bulk insert fitur (chunked)
    const features: Prisma.kml_featureCreateManyInput[] = [];

    for (const f of result.features) {
      const sublayerId = sublayerIdByPath.get(f.sublayerFolderPath);
      if (!sublayerId) continue;
      features.push({
        kml_layer_id: layer.id,
        kml_sublayer_id: sublayerId,
        name: f.name,
        feature_type: f.featureType,
        folder_path: f.folderPath,
        description_raw: f.descriptionRaw,
        parsed_metadata: f.parsedMetadata ?? Prisma.JsonNull,
        style_color: f.featureType === 'line' ? styleColorForLine(f.parsedMetadata) : null,
        line_color: f.lineColorHex,
        line_width: f.lineWidth,
        icon_key: f.iconKey,
        icon_color: f.iconColorHex,
        icon_scale: f.iconScale,
        latitude: f.latitude,
        longitude: f.longitude,
        path_coordinates: f.pathCoordinates ?? Prisma.JsonNull,
        node_role: f.nodeRole,
      });
    }

    for (let i = 0; i < features.length; i += BATCH_SIZE) {
      const chunk = features.slice(i, i + BATCH_SIZE);
      await prisma.kml_feature.createMany({ data: chunk });
    }

    return NextResponse.json({
      success: true,
      data: {
        layer_id: layer.id,
        title: layer.title,
        sublayer_count: sublayers.length,
        feature_count: result.parsedCount,
        point_count: pointCount,
        line_count: lineCount,
        storage_path: storagePath,
        warnings: result.warnings,
      },
      message: `Import berhasil. ${result.parsedCount} fitur dalam ${sublayers.length} sublayer.`,
    });
  } catch (error: unknown) {
    if (createdLayerId !== null) {
      try {
        await deleteKmlFile(createdLayerId);
        await prisma.kml_layer
          .delete({ where: { id: createdLayerId } })
          .catch(() => {});
      } catch {
        // ignore cleanup error
      }
    }
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal import file KML'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}

/** Normalisasi warna kabel berdasar Construction Status (PRD §9.4). */
function styleColorForLine(
  metadata: Record<string, string> | null,
): string | null {
  const status = (metadata?.['Construction Status'] ?? '').toLowerCase();
  if (status.includes('in service') || status.includes('beroperasi')) return '#22c55e';
  if (status.includes('belum')) return '#f59e0b';
  return '#94a3b8';
}
