import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseSearchType } from '@/lib/search-intent';
import { toEnumValue, toPositiveInt, toSortOrder } from '@/lib/http-query';
import { getOrSetCacheSwr } from '@/lib/cache';
import { QueryGateTimeoutError } from '@/lib/sql/query-gate';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets/daily
 *
 * Returns tickets for the daily operational work board.
 * Active tickets appear regardless of sync date. The customer operational
 * bucket additionally requires today's sync_date, except open pending carry-over.
 *
 * This creates a "working board" for daily operations while keeping
 * historical data in the database.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'tickets-daily',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['admin', 'superadmin', 'super_admin']);

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
    const ticketGroup = searchParams.getAll('ticketGroup').filter(Boolean);
    const operationalBucket = searchParams
      .getAll('operationalBucket')
      .filter(Boolean);
    const anomalyBucket = searchParams.getAll('anomalyBucket').filter(Boolean);
    const ticketStatus = searchParams.getAll('ticketStatus').filter(Boolean);
    const flagging = searchParams.getAll('flagging').filter(Boolean);
    const regulerOnlyParam = searchParams.get('regulerOnly');

    const rawDept = toEnumValue(dept ?? null, ['all', 'b2b', 'b2c', 'netral', 'neutral']);
    const filters = {
      search: searchParams.get('search') || '',
      ticketId: toPositiveInt(searchParams.get('ticketId'), 0, 10_000_000),
      symptom: searchParams.get('symptom') || '',
      excludeSymptom: searchParams.get('excludeSymptom') || '',
      searchType: parseSearchType(searchParams.get('searchType')),
      statusUpdate: statusUpdate.length > 0 ? statusUpdate : undefined,
      ticketStatus: ticketStatus.length > 0 ? ticketStatus : undefined,
      dept: rawDept === 'neutral' ? 'netral' : rawDept,
      ticketType: ticketType.length > 0 ? ticketType : undefined,
      ticketGroup: ticketGroup.length > 0 ? ticketGroup : undefined,
      operationalBucket:
        operationalBucket.length > 0 ? operationalBucket : undefined,
      regulerOnly:
        regulerOnlyParam === 'true'
          ? true
          : regulerOnlyParam === 'false'
            ? false
            : undefined,
      anomalyBucket: anomalyBucket.length > 0 ? anomalyBucket : undefined,
      flagging: flagging.length > 0 ? flagging : undefined,
      workzone: searchParams.get('workzone') || undefined,
      branchId:
        searchParams.get('branchId') || searchParams.get('branch') || undefined,
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: toPositiveInt(searchParams.get('page'), 1, 10_000),
      limit: toPositiveInt(searchParams.get('limit'), 50, 100),
      validasiPage: toPositiveInt(searchParams.get('validasiPage'), 1, 10_000),
      validasiLimit: toPositiveInt(searchParams.get('validasiLimit'), 10, 50),
      includeValidasi:
        searchParams.get('includeValidasi') === 'false' ? false : true,
      includeValidasiTickets:
        searchParams.get('includeValidasiTickets') === 'false' ? false : true,
      includeOptions:
        searchParams.get('includeOptions') === 'false' ? false : true,
      includeFlagging: searchParams.get('includeFlagging') !== 'false',
      includeClosed: searchParams.get('includeClosed') === 'true',
      gamasOnly: searchParams.get('gamasOnly') === 'true',
      sort: toSortOrder(searchParams.get('sort'), 'desc'),
      sortField: searchParams.get('sortField') || undefined,
      cursor: searchParams.get('cursor') || undefined,
      countOnly: searchParams.get('countOnly') === 'true',
      summaryOnly: searchParams.get('summaryOnly') === 'true',
    };

    // Build cache key identical to service internal cacheKeyBase
    const cacheKey = `daily_tickets:v2:${user.role}:${user.id_user}:${JSON.stringify(filters)}`;
    // Satu cache-miss menjalankan 7-9 query berat; SWR + TTL 60 detik menjaga
    // response tetap instan sambil recompute di background.
    const CACHE_TTL_SECONDS = 60;

    const result = await getOrSetCacheSwr(
      cacheKey,
      () =>
        DailyTicketService.getDailyTicketTable(
          user.role,
          user.id_user,
          filters,
        ),
      CACHE_TTL_SECONDS,
    );

    return NextResponse.json(
      { success: true, data: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    const overloaded = error instanceof QueryGateTimeoutError ||
      getErrorStatus(error, 500) === 503 || isQueryOverloadError(error);
    const status = overloaded ? 503 : getErrorStatus(error, 500);
    const context = {
      durationMs: Date.now() - startedAt,
      status,
      error: getErrorMessage(error, 'Unknown error'),
    };
    if (overloaded) logger.warn('tickets-daily overloaded', context);
    else if (status >= 500) logger.error('tickets-daily failed', context);

    return NextResponse.json(
      {
        success: false,
        message: overloaded
          ? 'Layanan tiket sedang sibuk. Coba lagi beberapa saat.'
          : getErrorMessage(error, 'Error fetching daily tickets'),
      },
      { status, headers: { 'Cache-Control': 'no-store', ...(overloaded ? { 'Retry-After': '30' } : {}) } },
    );
  }
}
