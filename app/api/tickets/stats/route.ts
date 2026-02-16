import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function GET() {
  try {
    await protectApi(['admin', 'teknisi', 'helpdesk', 'superadmin']);

    const stats = await TicketService.getStats();

    return Response.json({
      success: true,
      data: {
        total: stats.total || 0,
        open: stats.open || 0,
        assigned: stats.assigned || 0,
        closed: stats.closed || 0,
      },
    });
  } catch (error: any) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
