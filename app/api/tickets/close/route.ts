export const runtime = 'nodejs';

import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { closeTicketSchema } from '@/app/libs/validations/ticket.schema';
import { validateBody } from '@/app/libs/validations/validate';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-close',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);

    const body = await req.json().catch(() => null);
    const parsed = validateBody(closeTicketSchema, {
      ticketId: body?.ticketId,
      rca: body?.rca,
      subRca: body?.subRca,
      descriptionSolutionDompis: body?.descriptionSolutionDompis,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'ticketId wajib valid dan detail perbaikan minimal 10 karakter',
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { ticketId, rca, subRca, descriptionSolutionDompis } = parsed.data;

    const result = (await TicketWorkflowService.closeTicket(
      Number(ticketId),
      user,
      rca ?? '',
      subRca ?? '',
      descriptionSolutionDompis,
    )) as { message: string };

    broadcastTicketInvalidate('close');

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to close ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
