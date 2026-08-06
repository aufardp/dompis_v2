export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { retryQuarantined } from '@/lib/dlq';

export async function POST(request: NextRequest) {
  try {
    await protectApi(['superadmin', 'super_admin', 'admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'monitoring-dlq-retry',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = (await request.json().catch(() => ({}))) as {
      source?: string;
      max?: number;
    };
    const source = body.source ?? '';
    const max = Math.min(Math.max(Number(body.max ?? 50), 1), 200);

    if (!/^[a-z0-9-]+$/i.test(source)) {
      return NextResponse.json({ success: false, message: 'source invalid' }, { status: 400 });
    }

    const result = await retryQuarantined(source, max);

    return NextResponse.json({ success: true, source, ...result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'DLQ retry failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
