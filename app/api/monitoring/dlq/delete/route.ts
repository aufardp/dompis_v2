export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { deleteQuarantineItem } from '@/lib/dlq';

export async function POST(request: NextRequest) {
  try {
    await protectApi(['superadmin', 'super_admin', 'admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'monitoring-dlq-delete',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = (await request.json().catch(() => ({}))) as {
      source?: string;
      id?: string;
    };
    const source = body.source ?? '';
    const id = body.id ?? '';

    if (!/^[a-z0-9-]+$/i.test(source) || !/^[a-zA-Z0-9-]+$/.test(id)) {
      return NextResponse.json(
        { success: false, message: 'source/id invalid' },
        { status: 400 },
      );
    }

    const removed = await deleteQuarantineItem(source, id);

    return NextResponse.json({ success: true, source, id, removed });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'DLQ delete failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
