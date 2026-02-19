export const runtime = 'nodejs';

import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function POST(req: Request) {
  try {
    const user = await protectApi(['teknisi']);

    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const result = await TicketWorkflowService.pickupTicket(
      Number(ticketId),
      user,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to pickup');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
