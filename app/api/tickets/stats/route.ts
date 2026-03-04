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
    const includeBy = searchParams.get('includeBy');
    const dept = searchParams.get('dept') || undefined;
    const ticketType =
      searchParams.get('ticketType') ||
      searchParams.get('jenisTiket') ||
      undefined;
    const hasilVisit =
      searchParams.get('hasilVisit') || searchParams.get('status') || undefined;

    const stats = await TicketService.getStats(user.role, user.id_user, saId, {
      dept,
      ticketType,
      hasilVisit,
    });

    const includeByArray = includeBy ? includeBy.split(',') : [];

    const byServiceArea = includeByArray.includes('sa')
      ? await TicketService.getStatsByServiceArea(
          user.role,
          user.id_user,
          saId,
          {
            dept,
            ticketType,
            hasilVisit,
          },
        )
      : undefined;

    const byCustomerType =
      includeByArray.includes('ctype') && dept !== 'b2b'
        ? await TicketService.getStatsByCustomerType(
            user.role,
            user.id_user,
            saId,
            {
              dept,
              ticketType,
              hasilVisit,
            },
          )
        : undefined;

    const byFlaggingB2C = includeByArray.includes('flagging')
      ? await TicketService.getStatsByFlaggingB2C(
          user.role,
          user.id_user,
          saId,
          {
            dept,
            ticketType,
            hasilVisit,
          },
        )
      : undefined;

    const byGuaranteeB2C = includeByArray.includes('guarantee')
      ? await TicketService.getStatsByGuaranteeB2C(
          user.role,
          user.id_user,
          saId,
          {
            dept,
            ticketType,
            hasilVisit,
          },
        )
      : undefined;

    return NextResponse.json({
      success: true,
      data: {
        total: Number(stats?.total || 0),
        unassigned: Number(stats?.unassigned || 0),
        open: Number(stats?.open || 0),
        assigned: Number(stats?.assigned || 0),
        closed: Number(stats?.closed || 0),
        byServiceArea,
        byCustomerType,
        byFlaggingB2C,
        byGuaranteeB2C,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to load stats');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
