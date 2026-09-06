import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'fcm-token',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'teknisi',
      'admin',
      'superadmin',
      'super_admin',
      'helpdesk',
    ]);

    const body = (await request.json().catch(() => null)) as
      | { token?: string; platform?: string }
      | null;

    const token = String(body?.token ?? '').trim();
    if (!token || token.length > 255) {
      return NextResponse.json(
        { ok: false, message: 'token is required' },
        { status: 400 },
      );
    }
    const platform = String(body?.platform ?? 'android').trim().slice(0, 20);

    await prisma.user_devices.upsert({
      where: { fcm_token: token },
      create: { user_id: user.id_user, fcm_token: token, platform },
      update: { user_id: user.id_user, platform, updated_at: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, message: getErrorMessage(error, 'Failed to register token') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
