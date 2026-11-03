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
import { isRevisionSyncEnabled, lockTicketSyncState, markProjectionPending } from '@/lib/ingestion/sync-state';
import { isTicketClosed } from '@/app/libs/ticket-utils';

const reopenSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-reopen',
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
    const parsed = reopenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'ticketId wajib valid' },
        { status: 400 },
      );
    }
    const ticketId = parsed.data.ticketId;

    const roleKey = normalizeRoleKey((user as any)?.role ?? '');
    const roleId = roleKeyToRoleId(roleKey);

    const result = await prisma.$transaction(async (tx) => {
      let ticket = await tx.ticket.findUnique({
        where: { id_ticket: ticketId },
        select: {
          id_ticket: true,
          incident: true,
          status: true,
          status_update: true,
          teknisi_user_id: true,
          workzone: true,
          needs_validation: true,
        },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      if (isRevisionSyncEnabled()) {
        await lockTicketSyncState(tx, [ticket.incident]);
        await tx.$queryRaw`SELECT id_ticket FROM ticket WHERE id_ticket = ${ticketId} FOR UPDATE`;
        ticket = await tx.ticket.findUniqueOrThrow({
          where: { id_ticket: ticketId },
          select: { id_ticket: true, incident: true, status: true, status_update: true,
            teknisi_user_id: true, workzone: true, needs_validation: true },
        });
      }

      const currentStatus = String(ticket.status_update ?? ticket.status ?? '')
        .trim()
        .toLowerCase();
      const isValidationState =
        currentStatus === 'close' ||
        currentStatus === 'closed' ||
        isTicketClosed(ticket.status_update) ||
        ticket.needs_validation === true;

      if (!isValidationState) {
        throw new Error('Ticket is not in validation / closed state');
      }

      await tx.ticket.update({
        where: { id_ticket: ticketId },
        data: {
          status_update: 'open',
          closed_at: null,
          teknisi_user_id: null,
          needs_validation: false,
          validation_reason: null,
          validation_flagged_at: null,
        },
      });

      if (isRevisionSyncEnabled()) {
        const raw = await tx.ticket_raw.findUnique({ where: { incident: ticket.incident }, select: { sourceHash: true } });
        await tx.ticket_sync_state.update({ where: { incident: ticket.incident }, data: { manualReopenHash: raw?.sourceHash } });
        await markProjectionPending(tx, [ticket.incident]);
      }

      await tx.ticket_raw_finalized.deleteMany({
        where: { incident: ticket.incident },
      });

      await tx.ticket_tracking.updateMany({
        where: { ticket_id: ticketId },
        data: {
          closed_at: null,
          is_active: false,
        },
      });

      await logStatusChange(tx, {
        ticketId,
        oldStatus: currentStatus || 'close',
        newStatus: 'open',
        changedBy: user.id_user,
        roleId,
        note: 'Reopen from validation',
      });

      await logActivity(tx, {
        ticketId,
        userId: user.id_user,
        roleId,
        type: ActivityType.STATUS_CHANGE,
        description: 'Reopen ticket from validation',
      });

      return {
        ticketId: ticket.id_ticket,
        ticketCode: ticket.incident,
        workzone: ticket.workzone,
      };
    });

    broadcastTicketInvalidate('update');

    return NextResponse.json({
      success: true,
      message: 'Ticket berhasil direopen',
      data: result,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to reopen ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
