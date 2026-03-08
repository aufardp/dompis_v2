// app/services/ticket.helpers.ts

import prisma from '@/app/libs/prisma';
import { Prisma, ActivityType } from '@prisma/client';

// ── Workzone ──────────────────────────────────────────────────────────────────
export async function getWorkzonesForUser(userId: number): Promise<string[]> {
  const userSas = await prisma.user_sa.findMany({
    where: { user_id: userId },
    include: { service_area: true },
  });
  return userSas
    .map((us) => us.service_area?.nama_sa)
    .filter((name): name is string => name !== null && name !== undefined);
}

export async function resolveWorkzoneName(
  saId: number,
): Promise<string | null> {
  const sa = await prisma.service_area.findUnique({ where: { id_sa: saId } });
  return sa?.nama_sa ?? null;
}

// ── Tracking ──────────────────────────────────────────────────────────────────

export type TrackingUpsertPayload = {
  ticketId: number;
  assignedTo: number;
  isActive: boolean;
  now: Date;
  extra?: Partial<{
    assignedBy: number;
    assignedAt: Date;
    pickedUpAt: Date;
    onProgressAt: Date;
    pendingAt: Date;
    pendingReason: string | null;
    closedAt: Date;
  }>;
};

export async function upsertTracking(
  tx: Prisma.TransactionClient,
  p: TrackingUpsertPayload,
) {
  const base = {
    ticket_id: p.ticketId,
    assigned_to: p.assignedTo,
    is_active: p.isActive,
    updated_at: p.now,
    ...(p.extra?.assignedBy !== undefined && {
      assigned_by: p.extra.assignedBy,
    }),
    ...(p.extra?.assignedAt !== undefined && {
      assigned_at: p.extra.assignedAt,
    }),
    ...(p.extra?.pickedUpAt !== undefined && {
      picked_up_at: p.extra.pickedUpAt,
    }),
    ...(p.extra?.onProgressAt !== undefined && {
      on_progress_at: p.extra.onProgressAt,
    }),
    ...(p.extra?.pendingAt !== undefined && { pending_at: p.extra.pendingAt }),
    ...(p.extra?.pendingReason !== undefined && {
      pending_reason: p.extra.pendingReason,
    }),
    ...(p.extra?.closedAt !== undefined && { closed_at: p.extra.closedAt }),
  };

  return tx.ticket_tracking.upsert({
    where: { ticket_id: p.ticketId },
    create: base,
    update: base,
  });
}

// ── Activity & Status Logging ─────────────────────────────────────────────────

export async function logActivity(
  tx: Prisma.TransactionClient,
  payload: {
    ticketId: number;
    userId: number;
    roleId: number;
    type: ActivityType;
    description: string;
  },
) {
  return tx.ticket_activity_log.create({
    data: {
      ticket_id: payload.ticketId,
      user_id: payload.userId,
      role_id: payload.roleId,
      activity_type: payload.type,
      description: payload.description,
    },
  });
}

export async function logStatusChange(
  tx: Prisma.TransactionClient,
  payload: {
    ticketId: number;
    oldStatus: string | null;
    newStatus: string;
    changedBy: number;
    roleId: number;
    note?: string | null;
  },
) {
  return tx.ticket_status_history.create({
    data: {
      ticket_id: payload.ticketId,
      old_status: payload.oldStatus,
      new_status: payload.newStatus,
      changed_by: payload.changedBy,
      changed_role: payload.roleId,
      note: payload.note ?? null,
    },
  });
}
