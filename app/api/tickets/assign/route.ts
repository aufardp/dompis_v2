import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function POST(req: Request) {
  try {
    // 🔐 Hanya admin yang boleh assign
    await protectApi(['admin']);

    const body = await req.json();
    const { ticketId, teknisiUserId } = body;

    // 🔎 Validasi input
    if (!ticketId || !teknisiUserId) {
      return NextResponse.json(
        {
          success: false,
          message: 'ticketId dan teknisiUserId wajib diisi',
        },
        { status: 400 },
      );
    }

    const result = await TicketService.assignToUser(
      Number(ticketId),
      Number(teknisiUserId),
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to assign ticket',
      },
      { status: 400 },
    );
  }
}
