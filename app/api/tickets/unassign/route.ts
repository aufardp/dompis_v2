import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const user = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const data = await TicketService.getUnassignedTickets(
      user.role,
      user.id_user,
    );

    return NextResponse.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load tickets';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
