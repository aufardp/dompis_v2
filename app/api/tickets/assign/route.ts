export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { assignTicketSchema } from '@/app/libs/validations/ticket.schema';
import { validateBody } from '@/app/libs/validations/validate';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function POST(req: Request) {
  let lockKey: string | null = null;
  let ownerId: string | null = null;
  let ticketId = 0;
  let lockAcquired = false;

  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-assign',
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
    const parsed = validateBody(assignTicketSchema, {
      ticketId: body?.ticketId,
      teknisiUserId: body?.teknisiUserId ?? body?.teknisiId ?? body?.teknisi_id,
      forceReassign: body?.forceReassign,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'ticketId dan teknisiUserId wajib valid',
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { teknisiUserId, forceReassign } = parsed.data;
    ticketId = parsed.data.ticketId;

    lockKey = `ticket-lock:${ticketId}`;
    ownerId = `assign-${ticketId}-${Date.now()}-${Math.random()}`;
    lockAcquired = await acquireLock(lockKey, ownerId, 30);

    if (!lockAcquired) {
      return NextResponse.json(
        {
          success: false,
          message: 'Ticket sedang diproses oleh admin lain. Silakan coba lagi.',
        },
        { status: 409 },
      );
    }

    const result = (await TicketWorkflowService.assignToUser(
      Number(ticketId),
      Number(teknisiUserId),
      user,
      { forceReassign },
    )) as { message: string };

    broadcastTicketInvalidate('assign');

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: unknown) {
    const err = error as Error;
    const message = err.message || '';

    if (
      message.includes('Foreign key constraint violated') ||
      message.includes('constraint failed') ||
      message.includes('P2003') ||
      message.includes('P2014')
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `Tiket dengan ID ${ticketId} tidak valid atau sudah tidak ada di sistem`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to assign ticket'),
      },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    if (lockAcquired && lockKey && ownerId) {
      await releaseLock(lockKey, ownerId);
    }
  }
}
