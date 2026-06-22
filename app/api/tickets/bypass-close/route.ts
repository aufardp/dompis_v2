export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { roleKeyToRoleId, normalizeRoleKey } from '@/app/libs/roles';
import { ActivityType, logActivity, logStatusChange } from '@/app/helpers/ticket.helpers';
import { isTicketClosed, CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

const bypassCloseSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-bypass-close',
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
    const parsed = bypassCloseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'ticketId wajib valid' },
        { status: 400 },
      );
    }
    const ticketId = parsed.data.ticketId;

    const roleKey = normalizeRoleKey((user as any)?.role ?? '');
    const roleId = roleKeyToRoleId(roleKey);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id_ticket: ticketId },
        select: {
          id_ticket: true,
          incident: true,
          status: true,
          status_update: true,
          workzone: true,
        },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      const currentStatus = String(ticket.status ?? '').trim().toUpperCase();
      const currentStatusUpdate = String(ticket.status_update ?? '').trim().toLowerCase();

      if (isTicketClosed(ticket.status_update) || CLOSE_STATUS_VALUES.includes(currentStatus)) {
        throw new Error('Ticket already closed');
      }

      await tx.ticket.update({
        where: { id_ticket: ticketId },
        data: {
          status_update: 'close',
        },
      });

      await logStatusChange(tx, {
        ticketId,
        oldStatus: currentStatusUpdate || currentStatus || 'open',
        newStatus: 'close',
        changedBy: user.id_user,
        roleId,
        note: 'Bypass Close',
      });

      await logActivity(tx, {
        ticketId,
        userId: user.id_user,
        roleId,
        type: ActivityType.STATUS_CHANGE,
        description: `Bypass Close -> status_update set to close`,
      });

      return {
        ticketId: ticket.id_ticket,
        ticketCode: ticket.incident,
        workzone: ticket.workzone,
        incident: ticket.incident,
      };
    });

    broadcastTicketInvalidate('update');

    return NextResponse.json({
      success: true,
      message: 'Bypass Close berhasil',
      data: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to bypass close ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
