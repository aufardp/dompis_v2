export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import { invalidateTicketsCache } from '@/lib/cache';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import prisma from '@/app/libs/prisma';

export async function POST(req: Request) {
  const lockKey = 'ticket-lock';
  const ownerId = `assign-${Date.now()}-${Math.random()}`;
  let ticketId = 0;

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
    const teknisiUserId = Number(
      body.teknisiUserId ?? body.teknisiId ?? body.teknisi_id,
    );
    ticketId = Number(body.ticketId);
    const forceReassign = Boolean(body.forceReassign);

    if (!ticketId || !teknisiUserId) {
      return NextResponse.json(
        {
          success: false,
          message: 'ticketId and teknisiUserId (or teknisiId) are required',
        },
        { status: 400 },
      );
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id_ticket: ticketId },
      select: { id_ticket: true, incident: true },
    });

    if (!existingTicket) {
      return NextResponse.json(
        {
          success: false,
          message: `Tiket dengan ID ${ticketId} tidak ditemukan atau sudah dihapus`,
        },
        { status: 404 },
      );
    }

    const result = (await TicketWorkflowService.assignToUser(
      Number(ticketId),
      Number(teknisiUserId),
      user,
      { forceReassign },
    )) as { message: string };

    await invalidateTicketsCache();
    await new Promise((r) => setTimeout(r, 150));
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
    await releaseLock(lockKey, ownerId);
  }
}
