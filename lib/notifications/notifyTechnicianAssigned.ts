import type { SendResponse } from 'firebase-admin/messaging';
import prisma from '@/app/libs/prisma';
import { getMessaging } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/observability/logger';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

/**
 * Send a "Tiket baru ditugaskan" push to every device of the assigned technician.
 *
 * Best-effort: never throws. Callers invoke this post-commit, fire-and-forget.
 * No-ops when FCM is not configured, the target is not a technician, or the
 * technician has no registered devices.
 */
export async function notifyTechnicianAssigned(opts: {
  ticketId: number;
  technicianUserId: number;
}): Promise<void> {
  const { ticketId, technicianUserId } = opts;

  try {
    const msg = getMessaging();
    if (!msg) return;

    const isTechnician = await prisma.users.findFirst({
      where: { id_user: technicianUserId, roles: { is: { key: 'teknisi' } } },
      select: { id_user: true },
    });
    if (!isTechnician) return;

    const ticket = await prisma.ticket.findUnique({
      where: { id_ticket: ticketId },
      select: { id_ticket: true, incident: true, summary: true },
    });
    if (!ticket) return;

    const devices = await prisma.user_devices.findMany({
      where: { user_id: technicianUserId },
      select: { fcm_token: true },
    });
    const tokens = devices.map((d) => d.fcm_token);
    if (tokens.length === 0) return;

    const title = 'Tiket baru ditugaskan';
    const body = `Tiket #${ticket.incident} — ${(ticket.summary ?? '').slice(0, 80)}`;
    const url = `/teknisi/ticket/${ticketId}`;

    const res = await msg.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        type: 'ticket_assigned',
        ticket_id: String(ticketId),
        url,
        title,
        body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'dompis_ticket_channel',
          tag: `ticket_${ticketId}`,
        },
      },
    });

    const dead: string[] = [];
    res.responses.forEach((r: SendResponse, i: number) => {
      if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
        dead.push(tokens[i]);
      }
    });

    if (dead.length > 0) {
      await prisma.user_devices.deleteMany({
        where: { fcm_token: { in: dead } },
      });
    }

    logger.info('[FCM] ticket_assigned push sent', {
      component: 'notifications',
      ticketId,
      technicianUserId,
      tokens: tokens.length,
      success: res.successCount,
      failure: res.failureCount,
      pruned: dead.length,
    });
  } catch (err) {
    logger.warn('[FCM] ticket_assigned push failed', {
      component: 'notifications',
      ticketId,
      technicianUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
