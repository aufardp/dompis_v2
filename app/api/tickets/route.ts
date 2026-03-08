import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const TICKETS_CACHE_TTL = 30;

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildTicketCacheKey(
  params: URLSearchParams,
  role: string,
  userId: number,
  isMonitoring: boolean = false,
): string {
  const filterParams = new URLSearchParams(params);
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
      statusUpdate,
      dept: searchParams.get('dept') || undefined,
      ticketType:
        searchParams.get('ticketType') ||
        searchParams.get('jenisTiket') ||
        undefined,
      workzone: searchParams.get('workzone') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: toInt(searchParams.get('page'), 1),
      limit: toInt(searchParams.get('limit'), 50),
      sort: (searchParams.get('sort') as 'asc' | 'desc') || 'asc',
    };

    const cacheKey = buildTicketCacheKey(searchParams, user.role, user.id_user);

    const cached = await getCache(cacheKey);

    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const result = await TicketService.getTickets(
      user.role,
      user.id_user,
      filters,
    );

    await setCache(cacheKey, result, TICKETS_CACHE_TTL);

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
