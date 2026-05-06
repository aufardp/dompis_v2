import { NextResponse } from 'next/server';
import { AlertTicketService } from '@/app/libs/services/alert-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

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
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);

    const workzone = searchParams.get('workzone') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const includeAssigned =
      searchParams.get('includeAssigned') !== 'false';

    const [tickets, totalCount] = await Promise.all([
      AlertTicketService.getAlertDiamondTickets(
        user.role,
        user.id_user,
        workzone,
        { limit, includeAssigned },
      ),
      AlertTicketService.getAlertDiamondCount(
        user.role,
        user.id_user,
        workzone,
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
