import { getUserById, updateUser } from '@/app/libs/services/users.service';
import { updateUserSchema } from '@/app/libs/validations/users.schema';
import { protectApi } from '@/app/libs/protectApi';
import { NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { id } = await params;
    const userId = Number(id);

    if (!id || isNaN(userId)) {
      return NextResponse.json(
        { success: false, message: 'ID is required' },
        { status: 400 },
      );
    }

    const data = await getUserById(userId);

    if (!data) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('GET BY ID ERROR:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await protectApi(['admin', 'superadmin']);

    const { id } = await context.params;
    const userId = Number(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user ID' },
        { status: 400 },
      );
    }

    const body = await request.json();

    const validated = updateUserSchema.parse({
      ...body,
      role_id: body.role_id ? Number(body.role_id) : undefined,
      area_id: body.area_id ? Number(body.area_id) : undefined,
      sa_id: body.sa_id ? Number(body.sa_id) : undefined,
    });

    await updateUser(userId, {
      nik: validated.nik,
      nama: validated.nama,
      jabatan: validated.jabatan,
      username: validated.username,
      password: validated.password,
      role_id: validated.role_id,
      area_id: validated.area_id,
      sa_id: validated.sa_id,
    });

    return NextResponse.json({
      success: true,
      message: 'User berhasil diupdate',
    });
  } catch (error: any) {
    console.error('Update user error:', error);

    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Error saat mengupdate user',
      },
      { status },
    );
  }
}
