import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function GET() {
  try {
    await protectApi(['admin']);

    const data = await TicketService.getUnassignedTickets();

    return Response.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
