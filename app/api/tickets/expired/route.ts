import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export const dynamic = 'force-dynamic';

function toOptionalPositiveInt(value: string | null) {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

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
    const workzone =
      searchParams.get('workzone') || searchParams.get('sa_id') || null;
    const saId = toOptionalPositiveInt(workzone);

    const expiredTickets = await TicketService.getExpiredTickets(
      user.role,
      user.id_user,
      saId,
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
