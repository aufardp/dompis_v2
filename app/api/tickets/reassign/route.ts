import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function POST(req: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { ticketId, teknisiId } = await req.json();

    if (!ticketId || !teknisiId) {
      return NextResponse.json(
        { success: false, message: 'ticketId dan teknisiId wajib diisi' },
        { status: 400 },
      );
    }

    const result = await TicketService.assignToUser(
      Number(ticketId),
      Number(teknisiId),
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to reassign';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
