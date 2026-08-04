export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getOrSetCache } from '@/lib/cache';
import { getHealthSnapshot } from '@/lib/monitoring/health';

const CACHE_TTL_SECONDS = 30;
const CACHE_KEY = 'monitoring_overview:v1';

export async function GET() {
  await protectApi(['superadmin', 'super_admin', 'admin']);

  const data = await getOrSetCache(CACHE_KEY, () => getHealthSnapshot(), CACHE_TTL_SECONDS);

  return NextResponse.json(data);
}
