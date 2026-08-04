import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';
import { getErrorMessage } from '@/app/libs/apiError';
import {
  createRegion,
  updateRegion,
  deleteRegion,
} from '@/app/libs/services/region.service';
import { getBranchScope } from '@/app/libs/services/users.service';
import {
  createRegionSchema,
  updateRegionSchema,
  deleteRegionSchema,
} from '@/app/libs/validations/region.schema';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET(request: Request) {
  try {
    const actor = await protectApi(['superadmin', 'admin', 'helpdesk']);

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('all') === 'true';

    const scope = await getBranchScope(actor);

    const regions = await prisma.region.findMany({
      take: 50,
      where: scope
        ? {
            ...(includeInactive ? {} : { is_active: true }),
            branches: { some: { id_branch: { in: scope.branchIds } } },
          }
        : includeInactive
          ? {}
          : { is_active: true },
      orderBy: { nama_region: 'asc' },
      include: {
        branches: {
          where: scope ? { id_branch: { in: scope.branchIds } } : {},
          include: {
            areas: {
              where: scope ? { id_area: { in: scope.areaIds } } : {},
              select: { id_area: true, nama_area: true },
              orderBy: { nama_area: 'asc' },
            },
          },
          orderBy: { nama_branch: 'asc' },
        },
      },
    });
    
    return NextResponse.json(regions);
  } catch (error: any) {
    const status = error?.status;

    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: getErrorMessage(error, 'Unauthorized') },
        { status },
      );
    }

    logger.error('Region API error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'region',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const validated = createRegionSchema.parse(body);

    const id = await createRegion(validated);

    return NextResponse.json({
      success: true,
      message: 'Region created successfully',
      data: { id_region: id, nama_region: validated.nama_region },
    });
  } catch (error: any) {
    logger.error('Region POST error:', error);
    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error creating region') },
      { status },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'region',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const validated = updateRegionSchema.parse(body);

    await updateRegion(validated.id_region, {
      nama_region: validated.nama_region,
      is_active: validated.is_active,
    });

    return NextResponse.json({
      success: true,
      message: 'Region updated successfully',
    });
  } catch (error: any) {
    logger.error('Region PUT error:', error);
    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error updating region') },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'region',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id_region'));

    const parsed = deleteRegionSchema.safeParse({ id_region: id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }

    await deleteRegion(parsed.data.id_region);

    return NextResponse.json({
      success: true,
      message: 'Region deleted successfully',
    });
  } catch (error: any) {
    logger.error('Region DELETE error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error deleting region') },
      { status: 500 },
    );
  }
}
