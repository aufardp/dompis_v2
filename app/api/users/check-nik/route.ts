export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { findUserByNik } from '@/app/libs/services/users.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'users-check-nik',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(req.url);
    const nik = (searchParams.get('nik') || '').trim();
    const excludeIdParam = searchParams.get('exclude_id');

    if (!nik) {
      return NextResponse.json(
        { success: false, message: 'nik is required' },
        { status: 400 },
      );
    }

    const excludeId = excludeIdParam ? Number(excludeIdParam) : undefined;

    const owner = await findUserByNik(nik, excludeId);

    if (!owner) {
      return NextResponse.json({ success: true, exists: false, user: null });
    }

    return NextResponse.json({
      success: true,
      exists: true,
      user: {
        id_user: owner.id_user,
        nik: owner.nik,
        nama: owner.nama,
        username: owner.username,
        role_name: owner.roles?.name || '',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to check NIK'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
