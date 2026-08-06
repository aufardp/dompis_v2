export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { getOrSetCache } from '@/lib/cache';
import { getBridgeQueueStatus } from '@/lib/external-db/qosmic-bridge/bridge-queue';

const CACHE_TTL_SECONDS = 30;
const CACHE_KEY = 'monitoring_bridge_queues:v1';

export async function GET(request: NextRequest) {
  try {
    await protectApi(['superadmin', 'super_admin', 'admin']);

    const data = await getOrSetCache(
      CACHE_KEY,
      () => getBridgeQueueStatus(),
      CACHE_TTL_SECONDS,
    );

    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), queues: data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Bridge queue query failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
