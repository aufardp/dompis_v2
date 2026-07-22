import { NextResponse } from 'next/server';
import {
  createArea,
  updateArea,
  deleteArea,
} from '@/app/libs/services/area.service';
import {
  createAreaSchema,
  updateAreaSchema,
} from '@/app/libs/validations/area.schema';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { logger } from '@/lib/observability/logger';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const areas = await prisma.area.findMany({
      take: 500,
      select: { id_area: true, nama_area: true },
      orderBy: { nama_area: 'asc' },
    });

    const options = areas.map((a) => ({
      value: a.id_area,
      label: a.nama_area,
    }));

    return NextResponse.json(
      { success: true, data: options },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } },
    );
  } catch (error: any) {
    logger.error('Area fetch error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function POST(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'area',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const validated = createAreaSchema.parse(body);

    const id = await createArea(validated);

    return NextResponse.json({
      success: true,
      message: 'Area created successfully',
      data: { id_area: id, nama_area: validated.nama_area },
    });
  } catch (error: any) {
    const status = getErrorStatus(error, error.name === 'ZodError' ? 400 : 500);
    if (status >= 500) logger.error('Route error:', error);
    else logger.warn('Route error:', { error: { name: error?.name, message: error?.message } });
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error creating area'),
      },
      { status },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'area',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const validated = updateAreaSchema.parse({
      id_area: Number(body.id_area),
      nama_area: body.nama_area,
    });

    await updateArea(String(validated.id_area), {
      nama_area: validated.nama_area,
    });

    return NextResponse.json({
      success: true,
      message: 'Area updated successfully',
    });
  } catch (error: any) {
    const status = getErrorStatus(error, error.name === 'ZodError' ? 400 : 500);
    if (status >= 500) logger.error('Route error:', error);
    else logger.warn('Route error:', { error: { name: error?.name, message: error?.message } });
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error updating area'),
      },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'area',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'id is required' },
        { status: 400 },
      );
    }

    await deleteArea(id);

    return NextResponse.json({
      success: true,
      message: 'Area deleted successfully',
    });
  } catch (error: any) {
    const status = getErrorStatus(error, 500);
    if (status >= 500) logger.error('Route error:', error);
    else logger.warn('Route error:', { error: { name: error?.name, message: error?.message } });
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error deleting area'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
