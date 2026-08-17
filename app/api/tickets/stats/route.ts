import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const user = await protectApi(['teknisi']);

    const stats = await TicketService.getTicketStats(user.role, user.id_user);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching ticket stats'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}