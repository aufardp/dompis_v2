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
import db from '@/app/libs/db';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const [rows]: any = await db.query('SELECT * FROM area');

    // Transform data for react-select
    const options = rows.map((area: any) => ({
      value: area.id_area,
      label: area.nama_area,
      created_at: area.created_at,
      updated_at: area.updated_at,
    }));

    return NextResponse.json({
      success: true,
      data: options,
    });
  } catch (error: any) {
    console.error('Area fetch error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function POST(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const body = await request.json();
    const validated = createAreaSchema.parse(body);

    const id = await createArea(validated);

    return NextResponse.json({
      success: true,
      message: 'Area created successfully',
      data: { id_area: id, nama_area: validated.nama_area },
    });
  } catch (error: any) {
    console.error(error);
    const status = getErrorStatus(error, error.name === 'ZodError' ? 400 : 500);
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
    console.error(error);
    const status = getErrorStatus(error, error.name === 'ZodError' ? 400 : 500);
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
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error deleting area'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
