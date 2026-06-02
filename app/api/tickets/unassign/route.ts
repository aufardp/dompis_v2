export const runtime = 'nodejs';

import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { unassignTicketSchema } from '@/app/libs/validations/ticket.schema';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET() {
  try {
    const user = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const data = await TicketService.getUnassignedTickets(
      user.role,
      user.id_user,
    );

    return NextResponse.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to load tickets');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-unassign',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const body = await req.json().catch(() => null);
    const parsed = unassignTicketSchema.safeParse({
      ticketId: body?.ticketId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const { ticketId } = parsed.data;

    const result = (await TicketWorkflowService.unassignTicket(
      Number(ticketId),
      user,
    )) as { message: string };

    broadcastTicketInvalidate('unassign');

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to unassign ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
