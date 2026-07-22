import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toEnumValue, toPositiveInt } from '@/lib/http-query';
import { getOrSetCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'tickets-expired',
      limit: 40,
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

    const { searchParams } = new URL(request.url);
    const workzone =
      searchParams.get('workzone') || searchParams.get('sa_id') || null;
    const saId = workzone ? toPositiveInt(workzone, 0) || undefined : undefined;
    const dept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c']);
    const ticketType =
      searchParams.get('ticketType') ||
      searchParams.get('jenisTiket') ||
      undefined;
    const statusUpdate =
      searchParams.get('statusUpdate') ||
      searchParams.get('status') ||
      undefined;

    const cacheKey = `expired:${user.role}:${user.id_user}:${saId || 'all'}:${dept || 'all'}:${ticketType || 'all'}:${statusUpdate || 'all'}`;

    const expiredTickets = await getOrSetCache(cacheKey, async () => {
      return TicketService.getExpiredTickets(
        user.role,
        user.id_user,
        saId,
        { dept, ticketType, statusUpdate },
      );
    }, 30);

    return NextResponse.json({
      success: true,
      data: expiredTickets,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to load expired tickets');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
