import { NextResponse } from 'next/server';
import {
  getAllUsers,
  getUserById,
  createUser,
  deleteUser,
} from '@/app/libs/services/users.service';
import { createUserSchema } from '@/app/libs/validations/users.schema';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const role_id = searchParams.get('role_id');

    const data = await getAllUsers({
      role_id: role_id || undefined,
      search: search || undefined,
    });

    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await protectApi(['admin', 'superadmin']);

    const body = await request.json();
    const validated = createUserSchema.parse({
      ...body,
      role_id: Number(body.role_id),
      area_id: Number(body.area_id),
      sa_id: Number(body.sa_id),
    });

    const id = await createUser(validated);

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: {
        id,
        nik: validated.nik,
        nama: validated.nama,
        jabatan: validated.jabatan,
        username: validated.username,
        role_id: validated.role_id,
      },
    });
  } catch (error: any) {
    console.error(error);
    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      { success: false, message: error.message || 'Error creating user' },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await protectApi(['admin', 'superadmin']);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'id is required' },
        { status: 400 },
      );
    }

    await deleteUser(id);

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
