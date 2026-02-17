import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const user = await protectApi(['teknisi']);

    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const result = await TicketService.pickup(Number(ticketId), user.id_user);

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to pickup';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
