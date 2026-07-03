import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseSearchType } from '@/lib/search-intent';
import { toEnumValue, toPositiveInt, toSortOrder } from '@/lib/http-query';

export const dynamic = 'force-dynamic';

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
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'tickets-daily',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
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
    const ticketGroup = searchParams.getAll('ticketGroup').filter(Boolean);
    const operationalBucket = searchParams.getAll('operationalBucket').filter(Boolean);
    const anomalyBucket = searchParams.getAll('anomalyBucket').filter(Boolean);
    const ticketStatus = searchParams.getAll('ticketStatus').filter(Boolean);
    const flagging = searchParams.getAll('flagging').filter(Boolean);
    const regulerOnlyParam = searchParams.get('regulerOnly');

    const filters = {
      search: searchParams.get('search') || '',
      ticketId: toPositiveInt(searchParams.get('ticketId'), 0, 10_000_000),
      symptom: searchParams.get('symptom') || '',
      excludeSymptom: searchParams.get('excludeSymptom') || '',
      searchType: parseSearchType(searchParams.get('searchType')),
      statusUpdate: statusUpdate.length > 0 ? statusUpdate : undefined,
      ticketStatus: ticketStatus.length > 0 ? ticketStatus : undefined,
      dept: toEnumValue(dept ?? null, ['all', 'b2b', 'b2c']),
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
      ctype: searchParams.get('ctype') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: toPositiveInt(searchParams.get('page'), 1, 10_000),
      limit: toPositiveInt(searchParams.get('limit'), 50, 100),
      validasiPage: toPositiveInt(searchParams.get('validasiPage'), 1, 10_000),
      validasiLimit: toPositiveInt(searchParams.get('validasiLimit'), 10, 50),
      includeValidasi: searchParams.get('includeValidasi') === 'false' ? false : true,
      includeValidasiTickets:
        searchParams.get('includeValidasiTickets') === 'false' ? false : true,
      includeOptions: searchParams.get('includeOptions') === 'false' ? false : true,
      includeClosed: searchParams.get('includeClosed') === 'true',
      sort: toSortOrder(searchParams.get('sort'), 'desc'),
      sortField: searchParams.get('sortField') || undefined,
    };

    // Fetch from database
    const result = await DailyTicketService.getDailyTicketTable(
      user.role,
      user.id_user,
      filters,
    );

    return NextResponse.json(
      { success: true, data: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
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
