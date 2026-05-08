export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import prisma from '@/app/libs/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ODC_COLUMN_ALIASES = [
  'odc_value', 'odcvalue', 'odc',
  'ODC_VALUE', 'ODCValue', 'ODC',
  'odc value', 'odcvalue',
];

const AREA_COLUMN_ALIASES = [
  'area_name', 'areaname', 'area',
  'nama_area', 'namaarea',
  'AREA_NAME', 'AREA', 'NAMA_AREA',
  'Nama Area', 'Nama_Area',
  'area name',
];

function findColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase().trim());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function extractFields(
  entry: Record<string, unknown>,
  headers: string[],
): { odcValue: string; areaName: string | undefined } {
  const odcCol = findColumn(headers, ODC_COLUMN_ALIASES);
  const areaCol = findColumn(headers, AREA_COLUMN_ALIASES);

  const entryStr = entry as Record<string, string>;

  const odcValue = odcCol ? String(entryStr[odcCol] ?? '').trim() : '';
  const areaName = areaCol ? String(entryStr[areaCol] ?? '').trim() || undefined : undefined;

  return { odcValue, areaName };
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const clusterId = Number(id);

    const body = await req.json();
    let { odc_values } = body;

    if (!odc_values || !Array.isArray(odc_values)) {
      return NextResponse.json(
        { success: false, message: 'odc_values array is required' },
        { status: 400 },
      );
    }

    // Verify admin has access
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { sa_id: true },
    });

    if (!cluster) {
      return NextResponse.json({ success: false, message: 'Cluster not found' }, { status: 404 });
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

    const existingAreas = await prisma.cluster_area.findMany({
      where: { cluster_id: clusterId },
      select: { id: true, nama_area: true },
    });
    const areaNameMap = new Map<string, number>(
      existingAreas.map((a: { nama_area: string; id: number }) => [a.nama_area.toLowerCase(), a.id]),
    );

    const odcValuesList = odc_values
      .map((e) => (typeof e === 'string' ? e.split(',')[0].trim() : String(e.odc_value ?? '').trim()))
      .filter(Boolean);

    const existingNodes = await prisma.cluster_node.findMany({
      where: { odc_value: { in: odcValuesList } },
      select: { odc_value: true, cluster_id: true },
    });
    const otherClusterOdcs = new Set(
      existingNodes
        .filter((n: { cluster_id: number }) => n.cluster_id !== clusterId)
        .map((n: { odc_value: string }) => n.odc_value),
    );

    const result = {
      inserted: 0,
      skipped: 0,
      errors: [] as Array<{ odc_value: string; reason: string }>,
    };

    for (const rawEntry of odc_values) {
      let odcValue: string;
      let areaName: string | undefined;

      if (typeof rawEntry === 'string') {
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

      if (otherClusterOdcs.has(odcValue)) {
        result.skipped++;
        result.errors.push({ odc_value: odcValue, reason: `Sudah ada di cluster lain` });
        continue;
      }

      let cluster_area_id: number | null = null;
      if (areaName) {
        const lowerName = areaName.toLowerCase();
        if (areaNameMap.has(lowerName)) {
          cluster_area_id = areaNameMap.get(lowerName)!;
        } else {
          try {
            const newArea = await prisma.cluster_area.create({
              data: { cluster_id: clusterId, nama_area: areaName },
            });
            cluster_area_id = newArea.id;
            areaNameMap.set(lowerName, newArea.id);
          } catch {
            cluster_area_id = null;
          }
        }
      }

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
            ...(cluster_area_id !== null && { cluster_area_id }),
          },
        });
        result.inserted++;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code === 'P2002') {
          result.skipped++;
          result.errors.push({ odc_value: odcValue, reason: 'Sudah ada di database' });
        } else {
          result.errors.push({ odc_value: odcValue, reason: (err as Error)?.message ?? 'Unknown error' });
        }
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to import nodes') },
      { status: getErrorStatus(error, 400) },
    );
  }
}