// app/api/priority/summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { queryAllPrioritySummary } from '@/app/libs/priority/queries';
import { logger } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'priority-summary',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'admin_branch', 'senior_leader']);

    const result = await queryAllPrioritySummary(decoded.id_user, decoded.role);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    logger.error('Priority summary error:', error);
    return NextResponse.json(
      { success: false, message: 'Gagal memuat data priority.' },
      { status: 500 },
    );
  }
}