import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getCache, setCache } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { logger } from '@/lib/observability/logger';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 120;

function buildCacheKey(params: URLSearchParams, role: string, userId: number): string {
  const cloned = new URLSearchParams(params);
  cloned.sort();
  return `dashboard:semesta-analytics:${role}:${userId}:${cloned.toString()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'semesta-analytics',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const cacheKey = buildCacheKey(searchParams, user.role, user.id_user);
    const cached = await getCache(cacheKey);

    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const result = await TicketService.getSemestaAnalyticsV2(user.role, user.id_user, {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      workzone: searchParams.get('workzone') || undefined,
      dept: searchParams.get('dept') || undefined,
      ticketType: searchParams.get('ticketType') || undefined,
    });

    await setCache(cacheKey, result, CACHE_TTL_SECONDS);

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (isQueryOverloadError(error)) {
      logger.warn('semesta-analytics overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching semesta analytics'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
