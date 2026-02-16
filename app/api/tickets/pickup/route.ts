import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function POST(req: Request) {
  try {
    const user = await protectApi(['teknisi']);

    const { ticketId } = await req.json();

    const result = await TicketService.pickup(ticketId, user.id_user);

    return Response.json({ success: true, ...result });
  } catch (error: any) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
