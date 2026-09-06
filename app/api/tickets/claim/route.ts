export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { claimTicketSchema } from '@/app/libs/validations/ticket.schema';
import { validateBody } from '@/app/libs/validations/validate';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import prisma from '@/app/libs/prisma';
import { logActivity, ActivityType } from '@/app/helpers/ticket.helpers';
import { fastTrackingUpdate } from '@/app/helpers/tracking.helpers';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { getAttendanceGateByTechnicianSegment } from '@/app/libs/services/attendance-gate.service';
import { createTechEvent } from '@/app/libs/createTechEvent';
import { buildTechEventEvidence } from '@/app/libs/buildTechEventEvidence';
import { notifyTechnicianAssigned } from '@/lib/notifications/notifyTechnicianAssigned';
import { logger } from '@/lib/observability/logger';

export async function POST(req: Request) {
  let lockKey: string | null = null;
  let ownerId: string | null = null;
  let ticketId = 0;
  let lockAcquired = false;

  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-claim',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);

    const body = await req.json().catch(() => null);
    const parsed = validateBody(claimTicketSchema, { ticketId: body?.ticketId ?? body?.ticket_id });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'ticketId wajib valid', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    ticketId = parsed.data.ticketId;

    // Fetch ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id_ticket: ticketId },
      select: {
        id_ticket: true,
        incident: true,
        workzone: true,
        status_update: true,
        teknisi_user_id: true,
        service_no: true,
        contact_name: true,
        owner_group: true,
        customer_type: true,
      },
    });
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Tiket tidak ditemukan' }, { status: 404 });
    }
    if (ticket.teknisi_user_id) {
      return NextResponse.json({ success: false, message: 'Tiket sudah diambil teknisi lain' }, { status: 409 });
    }
    const st = String(ticket.status_update || 'open').toLowerCase();
    if (st !== 'open' && st !== '' && ticket.status_update !== null) {
      return NextResponse.json({ success: false, message: `Tiket status ${ticket.status_update} tidak bisa diambil` }, { status: 400 });
    }

    // SA eligibility: ticket.workzone must be in user's SA
    if (ticket.workzone) {
      const userSas = await prisma.user_sa.findMany({
        where: { user_id: user.id_user },
        include: { service_area: { select: { nama_sa: true } } },
        take: 50,
      });
      const allowedWorkzones = userSas.map((usa) => usa.service_area?.nama_sa).filter(Boolean) as string[];
      if (allowedWorkzones.length && !allowedWorkzones.includes(ticket.workzone)) {
        return NextResponse.json(
          { success: false, message: `Tiket workzone ${ticket.workzone} tidak sesuai area Anda (${allowedWorkzones.join(', ')})` },
          { status: 403 },
        );
      }
    }

    // Workload cap 40
    const today = AttendanceService.getTodayDateString();
    const targetStart = new Date(today + 'T00:00:00.000Z');
    const targetEnd = new Date(today + 'T23:59:59.999Z');
    const activeCount = await prisma.ticket.count({
      where: {
        teknisi_user_id: user.id_user,
        status_update: { in: ['assigned', 'on_progress', 'pending'] },
        ticket_tracking: { assigned_at: { gte: targetStart, lt: targetEnd } },
      },
    });
    if (activeCount >= 40) {
      return NextResponse.json({ success: false, message: 'Beban tiket Anda sudah 40, selesaikan dulu' }, { status: 400 });
    }

    // Fetch full user for segment + name
    const dbUser = await prisma.users.findUnique({
      where: { id_user: user.id_user },
      select: { technician_segment: true, nama: true, nik: true },
    });
    const gateRequired = await getAttendanceGateByTechnicianSegment(dbUser?.technician_segment || null);
    if (gateRequired) {
      const present = await AttendanceService.getTodayPresentTechnicianIds();
      if (!present.includes(user.id_user)) {
        return NextResponse.json({ success: false, message: 'Anda belum absen hari ini, silakan absen dulu' }, { status: 400 });
      }
    }

    lockKey = `ticket-lock:${ticketId}`;
    ownerId = `claim-${ticketId}-${Date.now()}-${Math.random()}`;
    lockAcquired = await acquireLock(lockKey, ownerId, 30);
    if (!lockAcquired) {
      return NextResponse.json({ success: false, message: 'Tiket sedang diproses, coba lagi' }, { status: 409 });
    }

    const now = new Date();
    const applied = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.ticket.updateMany({
          where: {
            id_ticket: ticketId,
            teknisi_user_id: null,
            OR: [{ status_update: null }, { status_update: 'open' }],
          },
          data: { teknisi_user_id: user.id_user, status_update: 'assigned' },
        });
        if (updated.count === 0) return false;
        await fastTrackingUpdate(tx, ticketId, user.id_user, now);
        await tx.ticket_assignment_history.updateMany({
          where: { ticket_id: ticketId, is_active: true },
          data: { is_active: false, unassigned_at: now },
        });
        await tx.ticket_assignment_history.create({
          data: {
            ticket_id: ticketId,
            assigned_by: user.id_user,
            assigned_to: user.id_user,
            assigned_at: now,
            is_active: true,
          },
        });
        await logActivity(tx, {
          ticketId,
          userId: user.id_user,
          roleId: (user as unknown as { role_id?: number }).role_id ?? 4,
          type: ActivityType.ASSIGN,
          description: `Take owner oleh ${dbUser?.nama || user.id_user}`,
        });
        return true;
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000 },
    );

    if (!applied) {
      return NextResponse.json({ success: false, message: 'Tiket sudah diambil teknisi lain' }, { status: 409 });
    }

    // Tech event async (fire and forget)
    void (async () => {
      try {
        const evidence = await buildTechEventEvidence(ticket.incident);
        await createTechEvent({
          event_type: 'TICKET_ASSIGNED',
          ticket: {
            id: ticket.id_ticket,
            incident: ticket.incident,
            workzone: ticket.workzone ?? '',
            service_no: ticket.service_no ?? '',
            customer_name: ticket.contact_name ?? '',
            owner_group: ticket.owner_group ?? null,
            customer_type: ticket.customer_type ?? null,
          },
          status: {
            old_hasil_visit: (ticket.status_update ? (ticket.status_update.toUpperCase() as import('@/app/libs/integrations/techEventTypes').HasilVisit) : 'OPEN'),
            new_hasil_visit: 'ASSIGNED' as import('@/app/libs/integrations/techEventTypes').HasilVisit,
            pending_dompis: null,
            evidence,
            rca: null,
            sub_rca: null,
          },
          old_technician: null,
          new_technician: { id_user: user.id_user, nik: dbUser?.nik ?? null, nama: dbUser?.nama ?? null },
          actor: { id_user: user.id_user, role: (user as unknown as { role?: string }).role || 'teknisi' },
          admin: { nama: 'TAKE OWNER', action: 'ASSIGNED' },
        });
      } catch (err) {
        logger.warn('claim tech event failed', { ticketId, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    void notifyTechnicianAssigned({
      ticketId,
      technicianUserId: user.id_user,
    }).catch(() => {});

    broadcastTicketInvalidate('assign');

    return NextResponse.json({ success: true, message: 'Tiket berhasil diambil', data: { ticketId } });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to claim ticket') },
      { status: getErrorStatus(error, 400) },
    );
  } finally {
    if (lockAcquired && lockKey && ownerId) await releaseLock(lockKey, ownerId);
  }
}
