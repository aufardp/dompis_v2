export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getQuarantineItems } from '@/lib/dlq';

export async function GET(request: NextRequest) {
  try {
    await protectApi(['superadmin', 'super_admin', 'admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'monitoring-dlq',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const source = request.nextUrl.searchParams.get('source') ?? '';
    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 20), 1),
      100,
    );
    const offset = Math.max(Number(request.nextUrl.searchParams.get('offset') ?? 0), 0);

    if (!/^[a-z0-9-]+$/i.test(source)) {
      return NextResponse.json({ success: false, message: 'source invalid' }, { status: 400 });
    }

    const items = await getQuarantineItems(source, limit, offset);

    return NextResponse.json({ success: true, source, limit, offset, items });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'DLQ query failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
