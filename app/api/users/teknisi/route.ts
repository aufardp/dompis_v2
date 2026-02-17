import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const data = await TicketService.getTeknisiUsers();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
