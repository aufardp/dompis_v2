import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createUser } from '@/app/libs/services/users.service';
import { logger } from '@/lib/observability/logger';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';


function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'auth-register',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const registerSchema = z.object({
      nik: z.string().min(1, 'NIK required'),
      nama: z.string().min(1, 'Nama required'),
      jabatan: z.string().min(1, 'Jabatan required'),
      username: z.string().min(1, 'Username required'),
      password: z.string().min(1, 'Password required'),
      role_id: z.coerce.number(),
      id_area: z.coerce.number(),
      id_sa: z.coerce.number().optional(),
    });

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { nik, nama, jabatan, username, password, role_id, id_area, id_sa } = parsed.data;

    if (Number(role_id) === 1) {
      return NextResponse.json(
        { success: false, message: 'Tidak dapat membuat user ber-role superadmin melalui registrasi' },
        { status: 403 },
      );
    }

    const sa_ids = id_sa ? [id_sa] : [];

    const id = await createUser({
      nik,
      nama,
      jabatan,
      username,
      password,
      role_id,
      area_id: id_area,
      sa_ids,
    });

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: { id },
    });
  } catch (error: unknown) {
    logger.error('Route error:', error);
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
