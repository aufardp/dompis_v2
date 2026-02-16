import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function POST(req: Request) {
  try {
    await protectApi(['admin']);

    const { ticketId, teknisiId } = await req.json();

    const result = await TicketService.assignToUser(ticketId, teknisiId);

    return Response.json({ success: true, ...result });
  } catch (error: any) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
