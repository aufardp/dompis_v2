import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

// Shorter cache TTL for daily tickets (more dynamic)
const DAILY_TICKETS_CACHE_TTL = 30;

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildDailyTicketCacheKey(
  params: URLSearchParams,
  role: string,
  userId: number,
): string | null {
  const filterParams = new URLSearchParams(params);

  // `_t` is used by client-side refreshes after mutations/SSE events.
  // Those refreshes must bypass Redis so the admin table reflects the latest assignment.
  if (filterParams.has('_t')) {
    return null;
  }

  filterParams.sort();
  return `daily_tickets:${role}:${userId}:${filterParams.toString()}`;
}

/**
 * GET /api/tickets/daily
 *
 * Returns tickets for the daily operational work board.
 * Filter logic:
 * - Tickets synced today (sync_date = TODAY) OR
 * - Tickets with pending_dompis (not null and not empty)
 *
 * This creates a "working board" for daily operations while keeping
 * historical data in the database.
 */
export async function GET(request: Request) {
  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);

    const statusUpdate = [
      ...searchParams.getAll('statusUpdate'),
      ...searchParams.getAll('status'),
    ].filter(Boolean);
    const dept = searchParams.get('dept') || undefined;
    const ticketType = [
      ...searchParams.getAll('ticketType'),
      ...searchParams.getAll('jenisTiket'),
    ].filter(Boolean);
    const flagging = searchParams.getAll('flagging').filter(Boolean);

    const filters = {
      search: searchParams.get('search') || '',
      statusUpdate: statusUpdate.length > 0 ? statusUpdate : undefined,
      dept,
      ticketType: ticketType.length > 0 ? ticketType : undefined,
      flagging: flagging.length > 0 ? flagging : undefined,
      workzone: searchParams.get('workzone') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: toInt(searchParams.get('page'), 1),
      limit: toInt(searchParams.get('limit'), 50),
      sort: (searchParams.get('sort') as 'asc' | 'desc') || 'desc',
    };

    // Build cache key
    const cacheKey = buildDailyTicketCacheKey(
      searchParams,
      user.role,
      user.id_user,
    );

    // Try to get from cache
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

    // Fetch from database
    const result = await DailyTicketService.getDailyTicketTable(
      user.role,
      user.id_user,
      filters,
    );

    // Cache the result
    if (cacheKey) {
      await setCache(cacheKey, result, DAILY_TICKETS_CACHE_TTL);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching daily tickets'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
