export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import prisma from '@/app/libs/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    const body = await req.json();
    const { odc_values } = body;

    if (!odc_values || !Array.isArray(odc_values)) {
      return NextResponse.json(
        {
          success: false,
          message: 'odc_values array is required',
        },
        { status: 400 },
      );
    }

    // Verify admin has access
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { sa_id: true },
    });

    if (!cluster) {
      return NextResponse.json(
        { success: false, message: 'Cluster not found' },
        { status: 404 },
      );
    }

    const userSa = await prisma.user_sa.findFirst({
      where: { user_id: user.id_user, sa_id: cluster.sa_id },
    });

    if (!userSa) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized - Access denied' },
        { status: 403 },
      );
    }

    // Fetch existing areas for this cluster (for name → id resolution)
    const existingAreas = await prisma.cluster_area.findMany({
      where: { cluster_id: clusterId },
      select: { id: true, nama_area: true },
    });
    const areaNameMap = new Map(
      existingAreas.map((a) => [a.nama_area.toLowerCase(), a.id]),
    );

    const result = {
      inserted: 0,
      skipped: 0,
      errors: [] as Array<{ odc_value: string; reason: string }>,
    };

    for (const rawEntry of odc_values) {
      // Support both string (odc_value only) and object { odc_value, area_name }
      let odcValue: string;
      let areaName: string | undefined;

      if (typeof rawEntry === 'string') {
        // Could be "ODC-XXX" or "ODC-XXX,AREA_NAME"
        const parts = rawEntry.split(',');
        odcValue = parts[0].trim();
        areaName = parts[1]?.trim();
      } else if (typeof rawEntry === 'object' && rawEntry !== null) {
        odcValue = String(rawEntry.odc_value ?? '').trim();
        areaName = rawEntry.area_name?.trim();
      } else {
        continue;
      }

      if (!odcValue) continue;

      // Resolve area_name to cluster_area_id
      let cluster_area_id: number | null = null;
      if (areaName) {
        const lowerName = areaName.toLowerCase();
        if (areaNameMap.has(lowerName)) {
          cluster_area_id = areaNameMap.get(lowerName)!;
        } else {
          // Auto-create area if not found
          try {
            const newArea = await prisma.cluster_area.create({
              data: {
                cluster_id: clusterId,
                nama_area: areaName,
              },
            });
            cluster_area_id = newArea.id;
            areaNameMap.set(lowerName, newArea.id);
          } catch {
            // If area creation fails, continue without area
            cluster_area_id = null;
          }
        }
      }

      // Upsert node
      try {
        await prisma.cluster_node.upsert({
          where: { odc_value: odcValue },
          create: {
            cluster_id: clusterId,
            odc_value: odcValue,
            cluster_area_id,
            sort_order: 0,
          },
          update: {
            // Update area if ODC already exists
            ...(cluster_area_id !== null && { cluster_area_id }),
          },
        });

        // Check if it was actually inserted or updated
        const existing = await prisma.cluster_node.findUnique({
          where: { odc_value: odcValue },
          select: { created_at: true },
        });

        // Simple heuristic: if we didn't get an error, count as inserted
        // (upsert doesn't tell us directly)
        result.inserted++;
      } catch (err: any) {
        // Prisma P2002 = unique constraint violation
        if (err?.code === 'P2002') {
          result.skipped++;
          result.errors.push({
            odc_value: odcValue,
            reason: 'Sudah ada di database',
          });
        } else {
          result.errors.push({
            odc_value: odcValue,
            reason: err?.message ?? 'Unknown error',
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to import nodes'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
