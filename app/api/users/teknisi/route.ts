import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const data = await TicketService.getTeknisiUsers();

    return Response.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return Response.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
