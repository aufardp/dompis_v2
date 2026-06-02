import { NextResponse } from 'next/server';
import { AlertTicketService } from '@/app/libs/services/alert-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { toBoolean, toEnumValue, toPositiveInt } from '@/lib/http-query';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets/alert/diamond
 *
 * Returns Diamond tickets that were synced TODAY only.
 * Used by the Alert Banner component to prevent showing
 * old historical tickets.
 *
 * Workzone filtering:
 * - Admin: sees only their assigned workzones (unless ?workzone= override)
 * - Teknisi: sees only their own assigned tickets
 */
export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'tickets-alert-diamond',
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

    const { searchParams } = new URL(request.url);

    const workzone = searchParams.get('workzone') || undefined;
    const dept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c']);
    const ticketType =
      searchParams.get('ticketType') ||
      searchParams.get('jenisTiket') ||
      undefined;
    const limit = toPositiveInt(searchParams.get('limit'), 200, 500);
    const includeAssigned = toBoolean(searchParams.get('includeAssigned'), true);

    const [tickets, totalCount] = await Promise.all([
      AlertTicketService.getAlertDiamondTickets(
        user.role,
        user.id_user,
        workzone,
        { limit, includeAssigned, dept, ticketType },
      ),
      AlertTicketService.getAlertDiamondCount(
        user.role,
        user.id_user,
        workzone,
        { dept, ticketType },
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: tickets,
      total: totalCount,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching alert diamond tickets'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
