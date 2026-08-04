import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/app/libs/prisma';
import {
  createServiceArea,
  getServiceAreaById,
  getServiceAreaByArea,
  updateServiceArea,
  deleteServiceArea,
} from '@/app/libs/services/serviceArea.service';
import { createServiceAreaSchema } from '@/app/libs/validations/serviceArea.schema';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

const updateServiceAreaSchema = z.object({
  id_sa: z.union([z.string().min(1, 'id_sa is required'), z.number().positive()]),
  nama_sa: z
    .string()
    .min(2, 'Nama minimal 2 karakter')
    .max(50, 'Nama maksimal 50 karakter')
    .optional(),
  area_id: z.union([z.string().min(1), z.number().positive()]).optional(),
});
import { logger } from '@/lib/observability/logger';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'teknisi',
    ]);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const id_area = searchParams.get('id_area');

    if (id) {
      const data = await getServiceAreaById(id);
      if (!data) {
        return NextResponse.json(
          { success: false, message: 'Service Area not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, data });
    }

    if (id_area) {
      const data = await getServiceAreaByArea(id_area);
      return NextResponse.json({ success: true, data });
    }

    if (user.role === 'super_admin' || user.role === 'superadmin') {
      const serviceAreas = await prisma.service_area.findMany({
        take: 500,
        orderBy: { nama_sa: 'asc' },
      });
      return NextResponse.json({
        success: true,
        data: serviceAreas.map((sa: (typeof serviceAreas)[0]) => ({
          value: String(sa.id_sa),
          label: sa.nama_sa,
        })),
      });
    }

    const userSa = await prisma.user_sa.findMany({
      take: 500,
      where: { user_id: user.id_user },
      include: { service_area: true },
    });

    const rows = userSa
      .filter((us: { service_area: any }) => us.service_area)
      .map((us: { service_area: any }) => ({
        value: String(us.service_area!.id_sa),
        label: us.service_area!.nama_sa,
      }));

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    logger.error('SA ERROR:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'sa',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(['superadmin'], { strict: true });

    const body = await req.json();
    const validated = createServiceAreaSchema.parse({
      ...body,
      area_id: Number(body.area_id),
    });

    const insertId = await createServiceArea(validated);

    return NextResponse.json({
      success: true,
      message: 'Service Area berhasil dibuat',
      data: { id_sa: insertId, nama_sa: validated.nama_sa },
    });
  } catch (error: any) {
    logger.error('POST ERROR:', error);
    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal membuat Service Area') },
      { status },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'sa',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(['superadmin'], { strict: true });

    const body = await req.json();

    const parsed = updateServiceAreaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }

    const { id_sa, nama_sa, area_id } = parsed.data;

    await updateServiceArea(String(id_sa), {
      nama_sa,
      area_id: area_id !== undefined ? String(area_id) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Service Area updated successfully',
    });
  } catch (error: any) {
    logger.error('PUT ERROR:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal mengupdate Service Area') },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'sa',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(['superadmin'], { strict: true });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'id is required' },
        { status: 400 },
      );
    }

    await deleteServiceArea(id);

    return NextResponse.json({
      success: true,
      message: 'Service Area deleted successfully',
    });
  } catch (error: any) {
    logger.error('DELETE ERROR:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal menghapus Service Area') },
      { status: 500 },
    );
  }
}
