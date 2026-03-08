export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import { invalidateTicketsCache } from '@/lib/cache';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';

export async function POST(req: Request) {
  const lockKey = 'ticket-lock';
  const ownerId = `assign-${Date.now()}-${Math.random()}`;

  const lockAcquired = await acquireLock(lockKey, ownerId, 30);

  if (!lockAcquired) {
    return NextResponse.json(
      {
        success: false,
        message: 'Ticket sedang diproses oleh admin lain. Silakan coba lagi.',
      },
      { status: 409 },
    );
  }

  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const body = await req.json();
    // Accept both teknisiUserId and teknisiId for backwards compatibility
    const teknisiUserId = Number(body.teknisiUserId ?? body.teknisiId ?? body.teknisi_id);
    const ticketId = Number(body.ticketId);

    if (!ticketId || !teknisiUserId) {
      return NextResponse.json(
        {
          success: false,
          message: 'ticketId and teknisiUserId (or teknisiId) are required',
        },
        { status: 400 },
      );
    }

    const result = await TicketWorkflowService.assignToUser(
      Number(ticketId),
      Number(teknisiUserId),
      user,
    );

    await invalidateTicketsCache();
    broadcastTicketInvalidate('assign');

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to assign ticket'),
      },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    await releaseLock(lockKey, ownerId);
  }
}
