export const runtime = 'nodejs';

import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { invalidateTicketsCache } from '@/lib/cache';

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

    const result = await TicketWorkflowService.closeTicket(
      Number(ticketId),
      user,
      String(rca || ''),
      String(subRca || ''),
    );

    await invalidateTicketsCache();

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to close ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
