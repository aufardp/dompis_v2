import { getOrSetCache } from '@/lib/cache';
import { TicketStatsService } from '@/app/libs/services/ticketStats.service';
import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toEnumValue } from '@/lib/http-query';

const CACHE_TTL = 120;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'tickets-stats',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const dept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c']);

    const stats = await getOrSetCache(
      `stats:dashboard:${dept ?? 'all'}`,
      () => TicketStatsService.getDashboardStats({ dept }),
      CACHE_TTL,
    );

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
