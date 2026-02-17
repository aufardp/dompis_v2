import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const result = await TicketService.unassign(Number(ticketId));

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to unassign ticket';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
