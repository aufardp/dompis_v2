import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const user = await protectApi(['teknisi']);

    const body = await req.json();

    const { ticketId, rca, subRca } = body;

    if (!ticketId)
      return NextResponse.json(
        { success: false, message: 'Ticket ID wajib diisi' },
        { status: 400 },
      );

    const result = await TicketService.close(
      Number(ticketId),
      user.id_user,
      String(rca || ''),
      String(subRca || ''),
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to close ticket';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
