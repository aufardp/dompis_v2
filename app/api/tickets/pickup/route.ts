export const runtime = 'nodejs';

import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { pickupTicketSchema } from '@/app/libs/validations/ticket.schema';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-pickup',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);

    const body = await req.json().catch(() => null);
    const parsed = pickupTicketSchema.safeParse({
      ticketId: body?.ticketId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const { ticketId } = parsed.data;

    const result = (await TicketWorkflowService.pickupTicket(
      Number(ticketId),
      user,
    )) as { message: string };

    broadcastTicketInvalidate('pickup');

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to pickup');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
