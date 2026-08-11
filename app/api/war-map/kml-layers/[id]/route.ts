export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { invalidateWarMapCache } from '@/lib/cache';
import { deleteKmlFile } from '@/app/libs/kml/storage';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-update',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const layerId = Number(id);
    if (!Number.isFinite(layerId) || layerId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid layer id' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new ApiError(400, 'Body tidak valid');
    }

    const layer = await prisma.kml_layer.findUnique({ where: { id: layerId } });
    if (!layer) throw new ApiError(404, 'Layer tidak ditemukan');

    const layerData: any = {};
    if (typeof body.title === 'string' && body.title.trim()) {
      layerData.title = body.title.trim().slice(0, 150);
    }
    if (typeof body.workzone_tag === 'string') {
      layerData.workzone_tag = body.workzone_tag.trim().slice(0, 100) || null;
    }
    if (body.status === 'active' || body.status === 'archived') {
      layerData.status = body.status;
    }

    const sublayerUpdates: Array<{ id: number; default_visible: boolean }> = [];
    if (body.sublayers && Array.isArray(body.sublayers)) {
      for (const s of body.sublayers) {
        if (!s || typeof s !== 'object') continue;
        const sid = Number(s.id);
        if (!Number.isFinite(sid) || typeof s.default_visible !== 'boolean') continue;
        sublayerUpdates.push({ id: sid, default_visible: s.default_visible });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedLayer = await tx.kml_layer.update({
        where: { id: layerId },
        data: layerData,
      });

      for (const update of sublayerUpdates) {
        await tx.kml_sublayer.updateMany({
          where: { id: update.id, kml_layer_id: layerId },
          data: { default_visible: update.default_visible },
        });
      }

      return updatedLayer;
    });

    await invalidateWarMapCache();

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        title: result.title,
        workzone_tag: result.workzone_tag,
        status: result.status,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-kml-delete',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const layerId = Number(id);
    if (!Number.isFinite(layerId) || layerId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid layer id' },
        { status: 400 },
      );
    }

    const layer = await prisma.kml_layer.findUnique({ where: { id: layerId } });
    if (!layer) throw new ApiError(404, 'Layer tidak ditemukan');

    await deleteKmlFile(layerId);

    // Cascade menghapus sublayer + feature via FK onDelete: Cascade
    await prisma.kml_layer.delete({ where: { id: layerId } });

    await invalidateWarMapCache();

    return NextResponse.json({ success: true, message: 'Layer dihapus' });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 500) },
    );
  }
}
