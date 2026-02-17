import { NextResponse } from 'next/server';
import { createUser } from '@/app/libs/services/users.service';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const saIdRaw: unknown = body?.id_sa;
    const saId =
      typeof saIdRaw === 'string' || typeof saIdRaw === 'number'
        ? Number(saIdRaw)
        : NaN;
    const sa_ids = Number.isFinite(saId) ? [saId] : [];

    const id = await createUser({
      nik: body.nik,
      nama: body.nama,
      jabatan: body.jabatan,
      username: body.username,
      password: body.password,
      role_id: Number(body.role_id),
      area_id: Number(body.id_area),
      sa_ids,
    });

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: { id },
    });
  } catch (error: unknown) {
    console.error(error);
    const status = 500;
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error) || 'Error creating user',
      },
      { status },
    );
  }
}
