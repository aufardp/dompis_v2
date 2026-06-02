import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getCache, setCache, TICKETS_CACHE_TTL } from '@/lib/cache';
import { parseSearchType } from '@/lib/search-intent';
import { toEnumValue, toPositiveInt, toSortOrder } from '@/lib/http-query';

export const dynamic = 'force-dynamic';

function buildTicketCacheKey(
  params: URLSearchParams,
  role: string,
  userId: number,
  isMonitoring: boolean = false,
): string | null {
  const filterParams = new URLSearchParams(params);
  
  // Skip cache if _t param is present (cache bypass for fresh data)
  if (filterParams.has('_t')) {
    return null;
  }
  
  filterParams.sort();
  return `tickets:${isMonitoring ? 'monitoring' : role}:${userId}:${filterParams.toString()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isMonitoring = searchParams.get('monitoring') === 'true';

  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const statusUpdate =
      searchParams.get('statusUpdate') ||
      searchParams.get('status') ||
      undefined;

    const filters = {
      search: searchParams.get('search') || '',
      searchType: parseSearchType(searchParams.get('searchType')),
      statusUpdate,
      dept: toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c']),
      ticketType:
        searchParams.get('ticketType') ||
        searchParams.get('jenisTiket') ||
        undefined,
      workzone: searchParams.get('workzone') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: toPositiveInt(searchParams.get('page'), 1, 10_000),
      limit: toPositiveInt(searchParams.get('limit'), 50, 100),
      sort: toSortOrder(searchParams.get('sort'), 'desc'),
    };

    const cacheKey = buildTicketCacheKey(searchParams, user.role, user.id_user);

    // Skip cache if bypass param (_t) is present
    if (cacheKey) {
      const cached = await getCache(cacheKey);

      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
          cached: true,
        });
      }
    }

    const result = await TicketService.getTickets(
      user.role,
      user.id_user,
      filters,
    );

    // Only cache if cache key is valid (no bypass)
    if (cacheKey) {
      await setCache(cacheKey, result, TICKETS_CACHE_TTL);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching tickets'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
