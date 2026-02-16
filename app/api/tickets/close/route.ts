import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function POST(req: Request) {
  try {
    const user = await protectApi(['teknisi']);

    const body = await req.json();

    const { ticketId, rca, subRca } = body;

    if (!ticketId)
      return Response.json(
        { success: false, message: 'Ticket ID wajib diisi' },
        { status: 400 },
      );

    const result = await TicketService.close(
      Number(ticketId),
      user.id_user,
      rca,
      subRca,
    );

    return Response.json({ success: true, ...result });
  } catch (error: any) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
