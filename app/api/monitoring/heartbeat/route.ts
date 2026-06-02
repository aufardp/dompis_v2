export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { recordOnlineUser } from '@/lib/monitoring/online-users';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function POST(request: NextRequest) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'teknisi',
    ]);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'heartbeat',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    let path = '/';
    try {
      const body = (await request.json()) as { path?: string };
      path = body?.path || '/';
    } catch {
      path = '/';
    }

    if (path === '/' || path === '/login' || path === '/register') {
      return NextResponse.json({ success: true, skipped: true });
    }

    await recordOnlineUser({
      userId: user.id_user,
      role: user.role,
      path,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Heartbeat failed'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
