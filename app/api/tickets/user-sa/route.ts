import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET(req: NextRequest) {
  try {
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);
    const tickets = await TicketService.getTicketsByUser(decoded.id_user);

    return NextResponse.json({
      success: true,
      data: tickets,
    });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Unexpected error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
