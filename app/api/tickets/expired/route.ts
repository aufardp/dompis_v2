import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toEnumValue, toPositiveInt } from '@/lib/http-query';

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
    const rawDept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c', 'netral', 'neutral']);
    const dept = rawDept === 'neutral' ? 'netral' : rawDept;
    const ticketType =
      searchParams.get('ticketType') ||
      searchParams.get('jenisTiket') ||
      undefined;
    const statusUpdate =
      searchParams.get('statusUpdate') ||
      searchParams.get('status') ||
      undefined;

    const expiredTickets = await TicketService.getExpiredTickets(
      user.role,
      user.id_user,
      saId,
      { dept, ticketType, statusUpdate },
    );

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
