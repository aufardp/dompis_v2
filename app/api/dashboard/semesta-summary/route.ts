import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getCache, setCache } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseSearchType } from '@/lib/search-intent';
import { toEnumValue } from '@/lib/http-query';
import { logger } from '@/lib/observability/logger';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 60;

function buildCacheKey(
  params: URLSearchParams,
  role: string,
  userId: number,
): string {
  const cloned = new URLSearchParams(params);
  cloned.sort();
  return `dashboard:semesta-summary:${role}:${userId}:${cloned.toString()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'semesta-summary',
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

    const rawDept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c', 'netral', 'neutral']);
    const result = await TicketService.getSemestaAnalytics(user.role, user.id_user, {
      search: searchParams.get('search') || undefined,
      searchType: parseSearchType(searchParams.get('searchType')),
      statusUpdate:
        searchParams.get('statusUpdate') ||
        searchParams.get('status') ||
        undefined,
      dept: rawDept === 'neutral' ? 'netral' : rawDept,
      ticketType:
        searchParams.get('ticketType') ||
        searchParams.get('jenisTiket') ||
        undefined,
      workzone: searchParams.get('workzone') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    await setCache(cacheKey, result, CACHE_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (isQueryOverloadError(error)) {
      logger.warn('semesta-summary overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching semesta summary'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
