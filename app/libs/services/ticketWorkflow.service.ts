import prisma from '@/app/libs/prisma';
import {
  assertRoleAllowed,
  normalizeRoleKey,
  roleKeyToRoleId,
} from '@/app/libs/roles';
import { ActivityType, TicketStatus } from '@/generated/prisma/enums';
import { Prisma } from '@/generated/prisma/client';

export type ActorContext = {
  id_user: number;
  role: string;
};

export type TicketUpdatePatch = {
  summary?: string | null;
  ownerGroup?: string | null;
  status?: string | null;
  workzone?: string | null;
  serviceType?: string | null;
  customerSegment?: string | null;
  customerType?: string | null;
  serviceNo?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  deviceName?: string | null;
  symptom?: string | null;
  alamat?: string | null;
  descriptionActualSolution?: string | null;
  pendingReason?: string | null;
};

export type TicketUpdateWorkflow = {
  status?: string;
  pendingReason?: string | null;
  note?: string | null;
};

export type UpdateTicketInput = {
  patch?: TicketUpdatePatch;
  workflow?: TicketUpdateWorkflow;
};

type VisitStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

function normalizeVisitStatus(value: unknown): VisitStatus {
  const s = String(value ?? '')
    .trim()
    .toUpperCase();

  if (!s) return 'OPEN';
  if (s === 'OPEN') return 'OPEN';
  if (s === 'ASSIGNED') return 'ASSIGNED';
  if (s === 'ON_PROGRESS' || s === 'IN_PROGRESS') return 'ON_PROGRESS';
  if (s === 'PENDING') return 'PENDING';
  if (s === 'ESCALATED') return 'ESCALATED';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
  if (s === 'CLOSE' || s === 'CLOSED') return 'CLOSE';

  throw new Error('Invalid ticket status');
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function cleanNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function truncateVarchar(value: string, max: number) {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return value.slice(0, max - 3) + '...';
}

async function resolveServiceAreaForWorkzone(
  tx: Prisma.TransactionClient,
  workzone: string | null,
) {
  if (!workzone) return null;
  const wz = normalizeKey(workzone);
  if (!wz) return null;

  const serviceAreas = await tx.service_area.findMany({
    select: { id_sa: true, nama_sa: true },
  });

  let best: { id_sa: number; nama_sa: string | null; norm: string } | undefined;

  for (const sa of serviceAreas) {
    const name = sa.nama_sa ? String(sa.nama_sa) : '';
    const norm = name ? normalizeKey(name) : '';
    if (!norm) continue;
    if (!wz.includes(norm)) continue;

    if (!best || norm.length > best.norm.length) {
      best = { id_sa: sa.id_sa, nama_sa: sa.nama_sa, norm };
    }
  }

  return best ? { id_sa: best.id_sa, nama_sa: best.nama_sa } : null;
}

async function assertAdminHasAccessToServiceArea(
  tx: Prisma.TransactionClient,
  actorId: number,
  serviceAreaId: number,
) {
  const access = await tx.user_sa.findFirst({
    where: {
      user_id: actorId,
      sa_id: serviceAreaId,
    },
    select: { id: true },
  });

  if (!access) throw new Error('Unauthorized');
}

async function assertTechnicianEligibleForServiceArea(
  tx: Prisma.TransactionClient,
  technicianId: number,
  serviceAreaId: number,
) {
  const mapping = await tx.user_sa.findFirst({
    where: {
      user_id: technicianId,
      sa_id: serviceAreaId,
    },
    select: { id: true },
  });

  if (!mapping) {
    throw new Error(
      'Selected technician is not assigned to this ticket workzone',
    );
  }
}

async function lockTicketRow(tx: Prisma.TransactionClient, ticketId: number) {
  const rows = await tx.$queryRaw<
    Array<{
      id_ticket: number;
      INCIDENT: string;
      WORKZONE: string | null;
      teknisi_user_id: number | null;
      HASIL_VISIT: string | null;
      PENDING_REASON: string | null;
    }>
  >`
    SELECT id_ticket, INCIDENT, WORKZONE, teknisi_user_id, HASIL_VISIT, PENDING_REASON
    FROM ticket
    WHERE id_ticket = ${ticketId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

function assertTransition(
  action: 'ASSIGN' | 'UNASSIGN' | 'PICKUP' | 'CLOSE',
  from: VisitStatus,
) {
  if (action === 'ASSIGN') {
    if (from === 'OPEN' || from === 'ASSIGNED') return;
    throw new Error('Invalid status transition');
  }

  if (action === 'UNASSIGN') {
    if (from === 'ASSIGNED') return;
    throw new Error('Invalid status transition');
  }

  if (action === 'PICKUP') {
    if (from === 'ASSIGNED') return;
    throw new Error('Invalid status transition');
  }

  if (action === 'CLOSE') {
    if (from === 'ON_PROGRESS') return;
    throw new Error('Invalid status transition');
  }
}

function toTrackingStatus(from: VisitStatus): TicketStatus | null {
  switch (from) {
    case 'OPEN':
      return null;
    case 'ASSIGNED':
      return TicketStatus.ASSIGNED;
    case 'ON_PROGRESS':
      return TicketStatus.ON_PROGRESS;
    case 'PENDING':
      return TicketStatus.PENDING;
    case 'ESCALATED':
      return TicketStatus.ESCALATED;
    case 'CANCELLED':
      return TicketStatus.CANCELLED;
    case 'CLOSE':
      return TicketStatus.CLOSE;
  }
}

export class TicketWorkflowService {
  static async getEligibleTechniciansByTicketId(
    ticketId: number,
    search?: string,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Invalid ticket id');
    }

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id_ticket: ticketId },
        select: { id_ticket: true, WORKZONE: true },
      });

      if (!ticket) throw new Error('Ticket not found');

      const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);
      if (!sa) {
        return {
          ticketId,
          workzone: ticket.WORKZONE,
          serviceAreaId: null,
          serviceAreaName: null,
          technicians: [],
        };
      }

      const keyword = search?.trim();

      const technicians = await tx.users.findMany({
        where: {
          roles: { is: { key: 'teknisi' } },
          user_sa: { some: { sa_id: sa.id_sa } },
          ...(keyword
            ? {
                OR: [
                  { nama: { contains: keyword } },
                  { nik: { contains: keyword } },
                ],
              }
            : {}),
        },
        select: {
          id_user: true,
          nama: true,
          nik: true,
        },
        orderBy: { nama: 'asc' },
      });

      return {
        ticketId,
        workzone: ticket.WORKZONE,
        serviceAreaId: sa.id_sa,
        serviceAreaName: sa.nama_sa,
        technicians,
      };
    });

    return result;
  }

  static async assignToUser(
    ticketId: number,
    technicianId: number,
    actor: ActorContext,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Invalid ticketId');
    }
    if (!Number.isFinite(technicianId) || technicianId <= 0) {
      throw new Error('Invalid teknisiUserId');
    }
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0) {
      throw new Error('Unauthorized');
    }

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['admin', 'helpdesk', 'superadmin']);
    const roleId = roleKeyToRoleId(roleKey);

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const ticket = await lockTicketRow(tx, ticketId);
      if (!ticket) throw new Error('Ticket not found');

      const current = normalizeVisitStatus(ticket.HASIL_VISIT);
      if (current === 'CLOSE') throw new Error('Ticket already closed');
      if (current === 'ON_PROGRESS') {
        throw new Error('Ticket is in progress and cannot be reassigned');
      }

      assertTransition('ASSIGN', current);

      const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);
      if (!sa) {
        throw new Error('Ticket workzone is not mapped to a service area');
      }

      if (roleKey === 'admin') {
        await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
      }

      // Validate technician existence and role
      const techExists = await tx.users.findFirst({
        where: {
          id_user: technicianId,
          roles: { is: { key: 'teknisi' } },
        },
        select: { id_user: true },
      });
      if (!techExists) throw new Error('Technician not found');

      await assertTechnicianEligibleForServiceArea(tx, technicianId, sa.id_sa);

      if (
        ticket.teknisi_user_id != null &&
        ticket.teknisi_user_id === technicianId
      ) {
        throw new Error('Ticket is already assigned to this technician');
      }

      const isReassign = ticket.teknisi_user_id != null;
      const oldTechnicianId = ticket.teknisi_user_id;

      await tx.ticket.update({
        where: { id_ticket: ticketId },
        data: {
          teknisi_user_id: technicianId,
          HASIL_VISIT: 'ASSIGNED',
        },
      });

      // Upsert tracking state
      await tx.ticket_tracking.upsert({
        where: { ticket_id: ticketId },
        create: {
          ticket_id: ticketId,
          assigned_by: actor.id_user,
          assigned_to: technicianId,
          assigned_at: now,
          current_status: TicketStatus.ASSIGNED,
          is_active: true,
          updated_at: now,
        },
        update: {
          assigned_by: actor.id_user,
          assigned_to: technicianId,
          assigned_at: now,
          picked_up_at: null,
          on_progress_at: null,
          pending_at: null,
          closed_at: null,
          pending_reason: null,
          current_status: TicketStatus.ASSIGNED,
          is_active: true,
          updated_at: now,
        },
      });

      // Deactivate previous assignment(s)
      await tx.ticket_assignment_history.updateMany({
        where: { ticket_id: ticketId, is_active: true },
        data: { is_active: false, unassigned_at: now },
      });

      await tx.ticket_assignment_history.create({
        data: {
          ticket_id: ticketId,
          assigned_by: actor.id_user,
          assigned_to: technicianId,
          assigned_at: now,
          is_active: true,
        },
      });

      // Status history only if we move from OPEN to ASSIGNED
      if (current !== 'ASSIGNED') {
        await tx.ticket_status_history.create({
          data: {
            ticket_id: ticketId,
            old_status: toTrackingStatus(current),
            new_status: TicketStatus.ASSIGNED,
            changed_by: actor.id_user,
            changed_role: roleId,
            note: isReassign
              ? `Reassigned from #${oldTechnicianId} to #${technicianId}`
              : `Assigned to #${technicianId}`,
          },
        });
      }

      await tx.ticket_activity_log.create({
        data: {
          ticket_id: ticketId,
          user_id: actor.id_user,
          role_id: roleId,
          activity_type: isReassign
            ? ActivityType.REASSIGN
            : ActivityType.ASSIGN,
          description: isReassign
            ? `Reassigned from #${oldTechnicianId} to #${technicianId}`
            : `Assigned to #${technicianId}`,
        },
      });

      return {
        message: isReassign
          ? 'Ticket reassigned successfully'
          : 'Ticket assigned successfully',
      };
    });
  }

  static async unassignTicket(ticketId: number, actor: ActorContext) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Invalid ticketId');
    }
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0) {
      throw new Error('Unauthorized');
    }

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['admin', 'helpdesk', 'superadmin']);
    const roleId = roleKeyToRoleId(roleKey);

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const ticket = await lockTicketRow(tx, ticketId);
      if (!ticket) throw new Error('Ticket not found');

      const current = normalizeVisitStatus(ticket.HASIL_VISIT);
      if (current === 'CLOSE') throw new Error('Ticket already closed');

      assertTransition('UNASSIGN', current);

      if (ticket.teknisi_user_id == null) {
        throw new Error('Ticket is not assigned');
      }

      const oldTechnicianId = ticket.teknisi_user_id;

      const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);
      if (roleKey === 'admin') {
        if (!sa) throw new Error('Unauthorized');
        await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
      }

      await tx.ticket.update({
        where: { id_ticket: ticketId },
        data: {
          teknisi_user_id: null,
          HASIL_VISIT: 'OPEN',
        },
      });

      await tx.ticket_tracking.upsert({
        where: { ticket_id: ticketId },
        create: {
          ticket_id: ticketId,
          assigned_to: oldTechnicianId,
          current_status: TicketStatus.CANCELLED,
          is_active: false,
          updated_at: now,
        },
        update: {
          assigned_to: oldTechnicianId,
          current_status: TicketStatus.CANCELLED,
          is_active: false,
          updated_at: now,
        },
      });

      await tx.ticket_assignment_history.updateMany({
        where: { ticket_id: ticketId, is_active: true },
        data: { is_active: false, unassigned_at: now },
      });

      await tx.ticket_status_history.create({
        data: {
          ticket_id: ticketId,
          old_status: TicketStatus.ASSIGNED,
          new_status: TicketStatus.CANCELLED,
          changed_by: actor.id_user,
          changed_role: roleId,
          note: `Unassigned from #${oldTechnicianId}`,
        },
      });

      await tx.ticket_activity_log.create({
        data: {
          ticket_id: ticketId,
          user_id: actor.id_user,
          role_id: roleId,
          activity_type: ActivityType.STATUS_CHANGE,
          description: `Unassigned from #${oldTechnicianId}`,
        },
      });

      return { message: 'Ticket unassigned successfully' };
    });
  }

  static async pickupTicket(ticketId: number, actor: ActorContext) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('ticketId is required');
    }
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0) {
      throw new Error('Unauthorized');
    }

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['teknisi']);
    const roleId = roleKeyToRoleId(roleKey);

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const ticket = await lockTicketRow(tx, ticketId);
      if (!ticket) throw new Error('Ticket not found');

      if (ticket.teknisi_user_id == null) {
        throw new Error('Ticket is not assigned');
      }

      if (ticket.teknisi_user_id !== actor.id_user) {
        throw new Error('Unauthorized');
      }

      const current = normalizeVisitStatus(ticket.HASIL_VISIT);
      assertTransition('PICKUP', current);

      await tx.ticket.update({
        where: { id_ticket: ticketId },
        data: {
          HASIL_VISIT: 'ON_PROGRESS',
        },
      });

      await tx.ticket_tracking.upsert({
        where: { ticket_id: ticketId },
        create: {
          ticket_id: ticketId,
          assigned_to: actor.id_user,
          picked_up_at: now,
          on_progress_at: now,
          current_status: TicketStatus.ON_PROGRESS,
          is_active: true,
          updated_at: now,
        },
        update: {
          assigned_to: actor.id_user,
          picked_up_at: now,
          on_progress_at: now,
          current_status: TicketStatus.ON_PROGRESS,
          is_active: true,
          updated_at: now,
        },
      });

      await tx.ticket_status_history.create({
        data: {
          ticket_id: ticketId,
          old_status: TicketStatus.ASSIGNED,
          new_status: TicketStatus.ON_PROGRESS,
          changed_by: actor.id_user,
          changed_role: roleId,
          note: 'Pickup -> ON_PROGRESS',
        },
      });

      await tx.ticket_activity_log.create({
        data: {
          ticket_id: ticketId,
          user_id: actor.id_user,
          role_id: roleId,
          activity_type: ActivityType.STATUS_CHANGE,
          description: 'Pickup -> ON_PROGRESS',
        },
      });

      return { message: 'Ticket picked up successfully' };
    });
  }

  static async closeTicket(
    ticketId: number,
    actor: ActorContext,
    rca: string,
    subRca: string,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Ticket ID wajib diisi');
    }
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0) {
      throw new Error('Unauthorized');
    }

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['teknisi']);
    const roleId = roleKeyToRoleId(roleKey);

    const now = new Date();
    const rcaValue = String(rca || '').trim();
    const subRcaValue = String(subRca || '').trim();
    if (!rcaValue || !subRcaValue) {
      throw new Error('RCA dan Sub RCA wajib diisi');
    }

    return prisma.$transaction(async (tx) => {
      const ticket = await lockTicketRow(tx, ticketId);
      if (!ticket) throw new Error('Ticket not found');

      if (ticket.teknisi_user_id == null) {
        throw new Error('Ticket is not assigned');
      }

      if (ticket.teknisi_user_id !== actor.id_user) {
        throw new Error('Unauthorized');
      }

      const current = normalizeVisitStatus(ticket.HASIL_VISIT);
      assertTransition('CLOSE', current);

      const evidenceCount = await tx.ticket_evidence.count({
        where: { ticket_id: ticketId },
      });

      if (evidenceCount < 2) {
        throw new Error('Minimal 2 evidence wajib sebelum close');
      }

      await tx.ticket.update({
        where: { id_ticket: ticketId },
        data: {
          HASIL_VISIT: 'CLOSE',
          rca: rcaValue,
          sub_rca: subRcaValue,
          closed_at: now,
        },
      });

      await tx.ticket_tracking.upsert({
        where: { ticket_id: ticketId },
        create: {
          ticket_id: ticketId,
          assigned_to: actor.id_user,
          closed_at: now,
          current_status: TicketStatus.CLOSE,
          is_active: false,
          updated_at: now,
        },
        update: {
          assigned_to: actor.id_user,
          closed_at: now,
          current_status: TicketStatus.CLOSE,
          is_active: false,
          updated_at: now,
        },
      });

      await tx.ticket_assignment_history.updateMany({
        where: { ticket_id: ticketId, is_active: true },
        data: { is_active: false, unassigned_at: now },
      });

      await tx.ticket_status_history.create({
        data: {
          ticket_id: ticketId,
          old_status: TicketStatus.ON_PROGRESS,
          new_status: TicketStatus.CLOSE,
          changed_by: actor.id_user,
          changed_role: roleId,
          note: 'Ticket closed',
        },
      });

      await tx.ticket_activity_log.create({
        data: {
          ticket_id: ticketId,
          user_id: actor.id_user,
          role_id: roleId,
          activity_type: ActivityType.CLOSE,
          description: 'Ticket closed',
        },
      });

      return { message: 'Ticket closed successfully' };
    });
  }

  static async updateTicket(
    ticketId: number,
    actor: ActorContext,
    input: UpdateTicketInput,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Invalid ticketId');
    }
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0) {
      throw new Error('Unauthorized');
    }

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['admin', 'helpdesk', 'superadmin', 'teknisi']);
    const roleId = roleKeyToRoleId(roleKey);

    const patch = input.patch ?? {};
    const workflow = input.workflow;

    const attemptedPatchKeys = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== undefined,
    );

    const allowedPatchKeys =
      roleKey === 'teknisi'
        ? (['descriptionActualSolution'] as const)
        : ([
            'summary',
            'ownerGroup',
            'status',
            'workzone',
            'serviceType',
            'customerSegment',
            'customerType',
            'serviceNo',
            'contactName',
            'contactPhone',
            'deviceName',
            'symptom',
            'alamat',
            'pendingReason',
          ] as const);

    for (const key of attemptedPatchKeys) {
      if (!(allowedPatchKeys as readonly string[]).includes(key)) {
        throw new Error('Forbidden - Access denied');
      }
    }

    const rawWorkflowStatus = workflow?.status;
    const hasWorkflowStatus = rawWorkflowStatus !== undefined;

    if (attemptedPatchKeys.length === 0 && !hasWorkflowStatus) {
      throw new Error('No updates provided');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const ticket = await lockTicketRow(tx, ticketId);
      if (!ticket) throw new Error('Ticket not found');

      const current = normalizeVisitStatus(ticket.HASIL_VISIT);

      const resolvePendingReason = async () => {
        const fromTicket = cleanNullableString(ticket.PENDING_REASON);
        if (fromTicket) return fromTicket;

        const row = await tx.ticket_tracking.findUnique({
          where: { ticket_id: ticketId },
          select: { pending_reason: true },
        });
        return cleanNullableString(row?.pending_reason) ?? null;
      };

      let pendingReasonTicketUpdate: string | null | undefined;

      if (roleKey === 'admin') {
        const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);
        if (!sa) throw new Error('Unauthorized');
        await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
      }

      if (roleKey === 'teknisi') {
        if (ticket.teknisi_user_id == null) throw new Error('Unauthorized');
        if (ticket.teknisi_user_id !== actor.id_user)
          throw new Error('Unauthorized');
        if (current === 'CLOSE') throw new Error('Ticket already closed');
        if (current !== 'ON_PROGRESS' && current !== 'PENDING') {
          throw new Error('Ticket must be ON_PROGRESS before updating');
        }
      }

      const ticketUpdate: Record<string, unknown> = {};
      const patchChanges: string[] = [];

      if (patch.summary !== undefined) {
        ticketUpdate.SUMMARY = cleanNullableString(patch.summary);
        patchChanges.push('summary');
      }
      if (patch.ownerGroup !== undefined) {
        ticketUpdate.OWNER_GROUP = cleanNullableString(patch.ownerGroup);
        patchChanges.push('ownerGroup');
      }
      if (patch.status !== undefined) {
        ticketUpdate.STATUS = cleanNullableString(patch.status);
        patchChanges.push('status');
      }
      if (patch.serviceType !== undefined) {
        ticketUpdate.SERVICE_TYPE = cleanNullableString(patch.serviceType);
        patchChanges.push('serviceType');
      }
      if (patch.customerSegment !== undefined) {
        ticketUpdate.CUSTOMER_SEGMENT = cleanNullableString(
          patch.customerSegment,
        );
        patchChanges.push('customerSegment');
      }
      if (patch.customerType !== undefined) {
        ticketUpdate.CUSTOMER_TYPE = cleanNullableString(patch.customerType);
        patchChanges.push('customerType');
      }
      if (patch.serviceNo !== undefined) {
        ticketUpdate.SERVICE_NO = cleanNullableString(patch.serviceNo);
        patchChanges.push('serviceNo');
      }
      if (patch.contactName !== undefined) {
        ticketUpdate.CONTACT_NAME = cleanNullableString(patch.contactName);
        patchChanges.push('contactName');
      }
      if (patch.contactPhone !== undefined) {
        ticketUpdate.CONTACT_PHONE = cleanNullableString(patch.contactPhone);
        patchChanges.push('contactPhone');
      }
      if (patch.deviceName !== undefined) {
        ticketUpdate.DEVICE_NAME = cleanNullableString(patch.deviceName);
        patchChanges.push('deviceName');
      }
      if (patch.symptom !== undefined) {
        ticketUpdate.SYMPTOM = cleanNullableString(patch.symptom);
        patchChanges.push('symptom');
      }
      if (patch.alamat !== undefined) {
        ticketUpdate.ALAMAT = cleanNullableString(patch.alamat);
        patchChanges.push('alamat');
      }
      if (patch.descriptionActualSolution !== undefined) {
        ticketUpdate.DESCRIPTION_ACTUAL_SOLUTION = cleanNullableString(
          patch.descriptionActualSolution,
        );
        patchChanges.push('descriptionActualSolution');
      }
      if (patch.pendingReason !== undefined) {
        if (roleKey === 'teknisi') throw new Error('Forbidden - Access denied');
        if (current !== 'PENDING') {
          throw new Error(
            'pendingReason can only be set when ticket is PENDING',
          );
        }

        const reason = cleanNullableString(patch.pendingReason);
        if (!reason) throw new Error('pendingReason is required');
        const reasonDb = truncateVarchar(reason, 255);

        if (ticket.teknisi_user_id == null) {
          throw new Error('Ticket is not assigned');
        }

        pendingReasonTicketUpdate = reasonDb;

        await tx.ticket_tracking.upsert({
          where: { ticket_id: ticketId },
          create: {
            ticket_id: ticketId,
            assigned_to: ticket.teknisi_user_id,
            pending_at: now,
            pending_reason: reasonDb,
            current_status: TicketStatus.PENDING,
            is_active: true,
            updated_at: now,
          },
          update: {
            pending_reason: reasonDb,
            updated_at: now,
          },
        });

        patchChanges.push('pendingReason');
      }

      if (patch.workzone !== undefined) {
        if (roleKey === 'teknisi') throw new Error('Forbidden - Access denied');

        const newWorkzone = cleanNullableString(patch.workzone);
        if (!newWorkzone) {
          throw new Error('workzone is required');
        }

        const saNew = await resolveServiceAreaForWorkzone(tx, newWorkzone);
        if (!saNew) {
          throw new Error('Ticket workzone is not mapped to a service area');
        }

        if (roleKey === 'admin') {
          await assertAdminHasAccessToServiceArea(
            tx,
            actor.id_user,
            saNew.id_sa,
          );
        }

        if (ticket.teknisi_user_id != null) {
          await assertTechnicianEligibleForServiceArea(
            tx,
            ticket.teknisi_user_id,
            saNew.id_sa,
          );
        }

        ticketUpdate.WORKZONE = newWorkzone;
        patchChanges.push('workzone');
      }

      // Workflow status update (kept strict to protect transitions)
      if (hasWorkflowStatus) {
        const cleaned = cleanNullableString(rawWorkflowStatus);
        if (!cleaned) throw new Error('status is required');

        const next = normalizeVisitStatus(cleaned);

        if (next === current) {
          if (roleKey === 'teknisi' && next === 'PENDING') {
            throw new Error('Ticket is already PENDING. Please resume first');
          }
          throw new Error('Ticket already has that status');
        }

        if (current === 'CLOSE') throw new Error('Ticket already closed');

        // Only support:
        // - teknisi: ON_PROGRESS <-> PENDING
        // - admin/helpdesk/superadmin: -> ESCALATED
        if (roleKey === 'teknisi') {
          if (
            ticket.teknisi_user_id == null ||
            ticket.teknisi_user_id !== actor.id_user
          ) {
            throw new Error('Unauthorized');
          }

          if (next === 'PENDING') {
            if (current !== 'ON_PROGRESS')
              throw new Error('Invalid status transition');

            const reason = cleanNullableString(workflow?.pendingReason);
            if (!reason) throw new Error('pendingReason is required');

            const reasonDb = truncateVarchar(reason, 255);
            pendingReasonTicketUpdate = reasonDb;

            ticketUpdate.HASIL_VISIT = 'PENDING';

            await tx.ticket_tracking.upsert({
              where: { ticket_id: ticketId },
              create: {
                ticket_id: ticketId,
                assigned_to: actor.id_user,
                pending_at: now,
                pending_reason: reasonDb,
                current_status: TicketStatus.PENDING,
                is_active: true,
                updated_at: now,
              },
              update: {
                assigned_to: actor.id_user,
                pending_at: now,
                pending_reason: reasonDb,
                current_status: TicketStatus.PENDING,
                is_active: true,
                updated_at: now,
              },
            });

            await tx.ticket_status_history.create({
              data: {
                ticket_id: ticketId,
                old_status: TicketStatus.ON_PROGRESS,
                new_status: TicketStatus.PENDING,
                changed_by: actor.id_user,
                changed_role: roleId,
                note: workflow?.note
                  ? String(workflow.note).trim()
                  : 'Set to PENDING',
              },
            });

            await tx.ticket_activity_log.create({
              data: {
                ticket_id: ticketId,
                user_id: actor.id_user,
                role_id: roleId,
                activity_type: ActivityType.STATUS_CHANGE,
                description: truncateVarchar(
                  `Status change: ${current} -> PENDING | reason: ${reasonDb}`,
                  255,
                ),
              },
            });
          } else if (next === 'ON_PROGRESS') {
            if (current !== 'PENDING')
              throw new Error('Invalid status transition');

            const previousReason = await resolvePendingReason();
            // ticket.PENDING_REASON is NOT NULL in some deployments; clear with empty string
            pendingReasonTicketUpdate = '';

            ticketUpdate.HASIL_VISIT = 'ON_PROGRESS';

            await tx.ticket_tracking.upsert({
              where: { ticket_id: ticketId },
              create: {
                ticket_id: ticketId,
                assigned_to: actor.id_user,
                on_progress_at: now,
                current_status: TicketStatus.ON_PROGRESS,
                pending_reason: null,
                is_active: true,
                updated_at: now,
              },
              update: {
                assigned_to: actor.id_user,
                on_progress_at: now,
                current_status: TicketStatus.ON_PROGRESS,
                pending_reason: null,
                is_active: true,
                updated_at: now,
              },
            });

            await tx.ticket_status_history.create({
              data: {
                ticket_id: ticketId,
                old_status: TicketStatus.PENDING,
                new_status: TicketStatus.ON_PROGRESS,
                changed_by: actor.id_user,
                changed_role: roleId,
                note: workflow?.note
                  ? String(workflow.note).trim()
                  : 'Resume work',
              },
            });

            await tx.ticket_activity_log.create({
              data: {
                ticket_id: ticketId,
                user_id: actor.id_user,
                role_id: roleId,
                activity_type: ActivityType.STATUS_CHANGE,
                description: truncateVarchar(
                  previousReason
                    ? `Status change: ${current} -> ON_PROGRESS | cleared reason: ${previousReason}`
                    : `Status change: ${current} -> ON_PROGRESS`,
                  255,
                ),
              },
            });
          } else {
            throw new Error('Invalid status transition');
          }
        } else {
          // admin/helpdesk/superadmin
          if (next !== 'ESCALATED')
            throw new Error('Invalid status transition');

          if (
            current !== 'ASSIGNED' &&
            current !== 'ON_PROGRESS' &&
            current !== 'PENDING'
          ) {
            throw new Error('Invalid status transition');
          }
          if (ticket.teknisi_user_id == null) {
            throw new Error('Ticket is not assigned');
          }

          const previousReason =
            current === 'PENDING' ? await resolvePendingReason() : null;
          // ticket.PENDING_REASON is NOT NULL in some deployments; clear with empty string
          pendingReasonTicketUpdate = '';

          ticketUpdate.HASIL_VISIT = 'ESCALATED';

          await tx.ticket_tracking.upsert({
            where: { ticket_id: ticketId },
            create: {
              ticket_id: ticketId,
              assigned_to: ticket.teknisi_user_id,
              current_status: TicketStatus.ESCALATED,
              pending_reason: null,
              is_active: true,
              updated_at: now,
            },
            update: {
              assigned_to: ticket.teknisi_user_id,
              current_status: TicketStatus.ESCALATED,
              pending_reason: null,
              is_active: true,
              updated_at: now,
            },
          });

          await tx.ticket_status_history.create({
            data: {
              ticket_id: ticketId,
              old_status: toTrackingStatus(current),
              new_status: TicketStatus.ESCALATED,
              changed_by: actor.id_user,
              changed_role: roleId,
              note: workflow?.note ? String(workflow.note).trim() : 'Escalated',
            },
          });

          await tx.ticket_activity_log.create({
            data: {
              ticket_id: ticketId,
              user_id: actor.id_user,
              role_id: roleId,
              activity_type: ActivityType.STATUS_CHANGE,
              description: truncateVarchar(
                previousReason
                  ? `Status change: ${current} -> ESCALATED | cleared reason: ${previousReason}`
                  : `Status change: ${current} -> ESCALATED`,
                255,
              ),
            },
          });
        }
      }

      const hasTicketUpdate = Object.keys(ticketUpdate).length > 0;
      if (hasTicketUpdate) {
        await tx.ticket.update({
          where: { id_ticket: ticketId },
          data: ticketUpdate as any,
        });
      }

      if (pendingReasonTicketUpdate !== undefined) {
        await tx.$executeRaw`
          UPDATE ticket
          SET PENDING_REASON = ${pendingReasonTicketUpdate}
          WHERE id_ticket = ${ticketId}
        `;
      }

      // Log field updates separately (status changes are logged above)
      if (patchChanges.length > 0) {
        await tx.ticket_activity_log.create({
          data: {
            ticket_id: ticketId,
            user_id: actor.id_user,
            role_id: roleId,
            activity_type: ActivityType.COMMENT,
            description: `Updated fields: ${patchChanges.join(', ')}`,
          },
        });
      }

      return { message: 'Ticket updated successfully' };
    });
  }

  static async logEvidenceUpload(
    ticketId: number,
    actor: ActorContext,
    fileCount: number,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Invalid ticketId');
    }
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0) {
      throw new Error('Unauthorized');
    }

    const roleKey = normalizeRoleKey(actor.role);
    const roleId = roleKeyToRoleId(roleKey);

    const count = Number.isFinite(fileCount) ? Math.max(0, fileCount) : 0;

    await prisma.$transaction(async (tx) => {
      await tx.ticket_activity_log.create({
        data: {
          ticket_id: ticketId,
          user_id: actor.id_user,
          role_id: roleId,
          activity_type: ActivityType.UPLOAD_EVIDENCE,
          description: `Uploaded ${count} evidence file(s)`,
        },
      });
    });
  }
}
