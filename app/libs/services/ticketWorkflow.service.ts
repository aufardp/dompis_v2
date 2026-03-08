// app/services/ticketWorkflow.service.ts

import prisma from '@/app/libs/prisma';
import {
  assertRoleAllowed,
  normalizeRoleKey,
  roleKeyToRoleId,
} from '@/app/libs/roles';
import { ActivityType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  upsertTracking,
  logActivity,
  logStatusChange,
} from '../../helpers/ticket.helpers';
import { fastTrackingUpdate } from '@/app/helpers/tracking.helpers';
import { createTechEvent } from '@/app/libs/createTechEvent';
import { buildTechEventEvidence } from '@/app/libs/buildTechEventEvidence';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { invalidateTicketsCache } from '@/lib/cache';
import {
  LockedTicket,
  ActorContext,
  TicketUpdatePatch,
  TicketUpdateWorkflow,
  UpdateTicketInput,
} from '@/app/types/ticket';

type TechnicianSnapshot = {
  id_user: number;
  nik: string | null;
  nama: string | null;
};

const technicianCache = new Map<number, TechnicianSnapshot>();

//transaction selesai, cache invalidated
async function commitAndInvalidate<T>(promise: Promise<T>): Promise<T> {
  const result = await promise;

  // Cache invalidation is now non-blocking (fire-and-forget)
  // so we can call it without await
  invalidateTicketsCache();

  return result;
}

async function getTechnicianSnapshot(
  tx: Prisma.TransactionClient,
  userId: number | null,
): Promise<TechnicianSnapshot | null> {
  if (!userId) return null;

  const cached = technicianCache.get(userId);

  if (cached) {
    return cached;
  }

  const row = await tx.users.findUnique({
    where: { id_user: userId },
    select: {
      id_user: true,
      nik: true,
      nama: true,
    },
  });

  if (!row) return null;

  const snapshot: TechnicianSnapshot = {
    id_user: row.id_user,
    nik: row.nik ?? null,
    nama: row.nama ?? null,
  };

  technicianCache.set(userId, snapshot);

  return snapshot;
}

async function getTicketDetails(
  tx: Prisma.TransactionClient,
  ticketId: number,
): Promise<{ service_no: string; customer_name: string } | null> {
  const row = await tx.ticket.findUnique({
    where: { id_ticket: ticketId },
    select: { SERVICE_NO: true, CONTACT_NAME: true },
  });
  if (!row) return null;
  return {
    service_no: row.SERVICE_NO ?? '',
    customer_name: row.CONTACT_NAME ?? '',
  };
}

async function getLatestAdminAssignment(
  tx: Prisma.TransactionClient,
  ticketId: number,
): Promise<{ nama: string | null } | null> {
  const assignment = await tx.ticket_assignment_history.findFirst({
    where: { ticket_id: ticketId },
    orderBy: { assigned_at: 'desc' },
    select: {
      assigner: {
        select: {
          nama: true,
        },
      },
    },
  });

  if (!assignment?.assigner) return null;

  return {
    nama: assignment.assigner.nama ?? null,
  };
}

async function getUserName(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<string | null> {
  const user = await tx.users.findUnique({
    where: { id_user: userId },
    select: { nama: true },
  });
  return user?.nama ?? null;
}

// ── Service Area Cache (35 items, TTL 1 hour) ────────────────────────────────

interface ServiceAreaCacheEntry {
  id_sa: number;
  nama_sa: string | null;
}

interface ServiceAreaCache {
  byId: Map<number, ServiceAreaCacheEntry>;
  byName: Map<string, ServiceAreaCacheEntry>;
  loadedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let serviceAreaCache: ServiceAreaCache | null = null;
let serviceAreaCacheLoading: Promise<ServiceAreaCache> | null = null;

async function loadServiceAreaCache(
  tx: Prisma.TransactionClient,
): Promise<ServiceAreaCache> {
  const serviceAreas = await tx.service_area.findMany({
    select: { id_sa: true, nama_sa: true },
    where: { nama_sa: { not: null } },
  });

  const byId = new Map<number, ServiceAreaCacheEntry>();
  const byName = new Map<string, ServiceAreaCacheEntry>();

  for (const sa of serviceAreas) {
    const entry: ServiceAreaCacheEntry = {
      id_sa: sa.id_sa,
      nama_sa: sa.nama_sa,
    };
    byId.set(sa.id_sa, entry);
    if (sa.nama_sa) {
      const normKey = normalizeKey(sa.nama_sa);
      byName.set(normKey, entry);
    }
  }

  return { byId, byName, loadedAt: Date.now() };
}

async function getServiceAreaCache(
  tx: Prisma.TransactionClient,
  forceRefresh = false,
): Promise<ServiceAreaCache> {
  if (!forceRefresh && serviceAreaCache) {
    const age = Date.now() - serviceAreaCache.loadedAt;

    if (age < CACHE_TTL_MS) {
      return serviceAreaCache;
    }
  }

  if (serviceAreaCacheLoading) {
    return serviceAreaCacheLoading;
  }

  serviceAreaCacheLoading = loadServiceAreaCache(tx);
  serviceAreaCache = await serviceAreaCacheLoading;
  serviceAreaCacheLoading = null;

  return serviceAreaCache;
}

export function invalidateServiceAreaCache() {
  serviceAreaCache = null;
}

// ── Internal Types ────────────────────────────────────────────────────────────

type VisitStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

type WorkflowResult = {
  ticketUpdate: Record<string, unknown>;
  pendingReason: string | null | undefined;
};

type PatchResult = {
  ticketUpdate: Record<string, unknown>;
  patchChanges: string[];
  pendingReason: string | null | undefined;
};

// ── Pure Utilities ────────────────────────────────────────────────────────────

function normalizeVisitStatus(value: unknown): VisitStatus {
  const s = String(value ?? '')
    .trim()
    .toUpperCase();

  if (!s || s === 'OPEN') return 'OPEN';
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

function toTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function cleanNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function truncate255(value: string): string {
  if (value.length <= 255) return value;
  return value.slice(0, 252) + '...';
}

function assertTransition(
  action: 'OPEN' | 'ASSIGN' | 'UNASSIGN' | 'PICKUP' | 'CLOSE',
  from: VisitStatus,
) {
  const allowed: Record<typeof action, VisitStatus[]> = {
    ASSIGN: ['OPEN', 'ASSIGNED', 'PENDING'],
    UNASSIGN: ['ASSIGNED', 'ON_PROGRESS', 'PENDING', 'ESCALATED'],
    PICKUP: ['ASSIGNED'],
    CLOSE: ['ON_PROGRESS'],
    OPEN: [],
  };

  if (!allowed[action].includes(from)) {
    throw new Error('Invalid status transition');
  }
}

// ── DB Helpers ────────────────────────────────────────────────────────────────

async function lockTicketRow(
  tx: Prisma.TransactionClient,
  ticketId: number,
): Promise<LockedTicket | null> {
  const rows = await tx.$queryRaw<LockedTicket[]>`
    SELECT id_ticket,
      INCIDENT, WORKZONE, teknisi_user_id, STATUS_UPDATE,
      PENDING_REASON, ALAMAT, SERVICE_NO, CONTACT_NAME
    FROM ticket
    WHERE id_ticket = ${ticketId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function resolveServiceAreaForWorkzone(
  tx: Prisma.TransactionClient,
  workzone: string | null,
): Promise<{ id_sa: number; nama_sa: string | null } | null> {
  if (!workzone) return null;

  const wzFlat = normalizeKey(workzone);
  if (!wzFlat) return null;

  const wzTokens = toTokens(workzone);

  const cache = await getServiceAreaCache(tx);

  // Prefer exact match (ignoring whitespace/case) to avoid accidental substring hits.
  for (const [, sa] of cache.byId) {
    const saFlat = sa.nama_sa ? normalizeKey(sa.nama_sa) : '';
    if (saFlat && saFlat === wzFlat) {
      return { id_sa: sa.id_sa, nama_sa: sa.nama_sa };
    }
  }

  // Token match: all SA tokens must exist in the workzone tokens.
  // This is more reliable than plain substring for overlapping SA names.
  let best:
    | {
        id_sa: number;
        nama_sa: string | null;
        score: number;
        flatLen: number;
      }
    | undefined;

  for (const [, sa] of cache.byId) {
    if (!sa.nama_sa) continue;
    const saTokens = toTokens(sa.nama_sa);
    if (saTokens.length === 0) continue;

    const allPresent = saTokens.every((t) => wzTokens.includes(t));
    if (!allPresent) continue;

    const saFlat = normalizeKey(sa.nama_sa);
    const flatLen = saFlat.length;
    const score = saTokens.length * 10 + Math.min(flatLen, 50);

    if (
      !best ||
      score > best.score ||
      (score === best.score && flatLen > best.flatLen)
    ) {
      best = { id_sa: sa.id_sa, nama_sa: sa.nama_sa, score, flatLen };
    }
  }

  if (best) return { id_sa: best.id_sa, nama_sa: best.nama_sa };

  // Fallback: longest substring match, but ignore very short SA names.
  let bestSub:
    | { id_sa: number; nama_sa: string | null; normLen: number }
    | undefined;

  for (const [, sa] of cache.byId) {
    const norm = sa.nama_sa ? normalizeKey(sa.nama_sa) : '';
    if (!norm || norm.length < 4) continue;
    if (!wzFlat.includes(norm)) continue;
    if (!bestSub || norm.length > bestSub.normLen) {
      bestSub = { id_sa: sa.id_sa, nama_sa: sa.nama_sa, normLen: norm.length };
    }
  }

  return bestSub ? { id_sa: bestSub.id_sa, nama_sa: bestSub.nama_sa } : null;
}

async function assertAdminHasAccessToServiceArea(
  tx: Prisma.TransactionClient,
  actorId: number,
  serviceAreaId: number,
) {
  const access = await tx.user_sa.findFirst({
    where: { user_id: actorId, sa_id: serviceAreaId },
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
    where: { user_id: technicianId, sa_id: serviceAreaId },
    select: { id: true },
  });
  if (!mapping) {
    throw new Error(
      'Selected technician is not assigned to this ticket workzone',
    );
  }
}

async function deactivateAssignmentHistory(
  tx: Prisma.TransactionClient,
  ticketId: number,
  now: Date,
) {
  return tx.ticket_assignment_history.updateMany({
    where: { ticket_id: ticketId, is_active: true },
    data: { is_active: false, unassigned_at: now },
  });
}

// ── Internal Workflow Handlers ────────────────────────────────────────────────

/**
 * Handles ON_PROGRESS <-> PENDING transitions for the teknisi role.
 * Returns the ticket column updates and the new pending reason value.
 */
async function handleTechnicianWorkflow(
  tx: Prisma.TransactionClient,
  ticket: LockedTicket,
  ticketId: number,
  actor: ActorContext,
  roleId: number,
  workflow: TicketUpdateWorkflow,
  current: VisitStatus,
  now: Date,
  resolvePendingReason: () => Promise<string | null>,
): Promise<WorkflowResult> {
  if (
    ticket.teknisi_user_id == null ||
    ticket.teknisi_user_id !== actor.id_user
  ) {
    throw new Error('Unauthorized');
  }

  const rawNext = cleanNullableString(workflow.status);
  if (!rawNext) throw new Error('status is required');

  const next = normalizeVisitStatus(rawNext);

  if (next === current) {
    throw new Error(
      next === 'PENDING'
        ? 'Ticket is already PENDING. Please resume first'
        : 'Ticket already has that status',
    );
  }
  if (current === 'CLOSE') throw new Error('Ticket already closed');

  // ON_PROGRESS → PENDING
  if (next === 'PENDING') {
    if (current !== 'ON_PROGRESS') throw new Error('Invalid status transition');

    const reason = cleanNullableString(workflow.pendingReason);
    if (!reason) throw new Error('pendingReason is required');

    const reasonDb = truncate255(reason);

    await fastTrackingUpdate(tx, ticketId, actor.id_user, now);

    await logStatusChange(tx, {
      ticketId,
      oldStatus: 'ON_PROGRESS',
      newStatus: 'PENDING',
      changedBy: actor.id_user,
      roleId,
      note: workflow.note ? String(workflow.note).trim() : 'Set to PENDING',
    });

    await logActivity(tx, {
      ticketId,
      userId: actor.id_user,
      roleId,
      type: ActivityType.STATUS_CHANGE,
      description: truncate255(
        `Status change: ON_PROGRESS -> PENDING | reason: ${reasonDb}`,
      ),
    });

    const tech = await getTechnicianSnapshot(tx, actor.id_user);
    const ticketDetails = await getTicketDetails(tx, ticketId);
    const adminInfo = await getLatestAdminAssignment(tx, ticketId);
    const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);
    await createTechEvent(
      {
        event_type: 'TICKET_STATUS_CHANGED',
        ticket: {
          id: ticketId,
          incident: ticket.INCIDENT,
          workzone: ticket.WORKZONE ?? '',
          service_no: ticketDetails?.service_no ?? '',
          customer_name: ticketDetails?.customer_name ?? '',
        },
        status: {
          old_hasil_visit: 'ON_PROGRESS',
          new_hasil_visit: 'PENDING',
          pending_reason: reasonDb,
          evidence,
          rca: null,
          sub_rca: null,
        },
        old_technician: tech,
        new_technician: tech,
        actor: { id_user: actor.id_user, role: actor.role },
        admin: adminInfo ? { nama: adminInfo.nama, action: 'ASSIGNED' } : null,
      },
      tx,
    );

    return {
      ticketUpdate: {
        STATUS_UPDATE: 'pending', // single source of truth
      },
      pendingReason: reasonDb,
    };
  }

  // PENDING → ON_PROGRESS
  if (next === 'ON_PROGRESS') {
    if (current !== 'PENDING') throw new Error('Invalid status transition');

    const previousReason = await resolvePendingReason();

    await upsertTracking(tx, {
      ticketId,
      assignedTo: actor.id_user,
      isActive: true,
      now,
      extra: { onProgressAt: now, pendingReason: null },
    });

    await logStatusChange(tx, {
      ticketId,
      oldStatus: 'PENDING',
      newStatus: 'ON_PROGRESS',
      changedBy: actor.id_user,
      roleId,
      note: workflow.note ? String(workflow.note).trim() : 'Resume work',
    });

    await logActivity(tx, {
      ticketId,
      userId: actor.id_user,
      roleId,
      type: ActivityType.STATUS_CHANGE,
      description: truncate255(
        previousReason
          ? `Status change: PENDING -> ON_PROGRESS | cleared reason: ${previousReason}`
          : 'Status change: PENDING -> ON_PROGRESS',
      ),
    });

    const tech = await getTechnicianSnapshot(tx, actor.id_user);
    const ticketDetails = await getTicketDetails(tx, ticketId);
    const adminInfo = await getLatestAdminAssignment(tx, ticketId);
    const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);
    await createTechEvent(
      {
        event_type: 'TICKET_STATUS_CHANGED',
        ticket: {
          id: ticketId,
          incident: ticket.INCIDENT,
          workzone: ticket.WORKZONE ?? '',
          service_no: ticketDetails?.service_no ?? '',
          customer_name: ticketDetails?.customer_name ?? '',
        },
        status: {
          old_hasil_visit: 'PENDING',
          new_hasil_visit: 'ON_PROGRESS',
          pending_reason: null,
          evidence,
          rca: null,
          sub_rca: null,
        },
        old_technician: tech,
        new_technician: tech,
        actor: { id_user: actor.id_user, role: actor.role },
        admin: adminInfo ? { nama: adminInfo.nama, action: 'ASSIGNED' } : null,
      },
      tx,
    );

    // Empty string clears PENDING_REASON in DB (column may be NOT NULL)
    return {
      ticketUpdate: {
        STATUS_UPDATE: 'on_progress', // single source of truth
      },
      pendingReason: '',
    };
  }

  throw new Error('Invalid status transition');
}

/**
 * Handles escalation for admin / helpdesk / superadmin roles.
 */
async function handleAdminWorkflow(
  tx: Prisma.TransactionClient,
  ticket: LockedTicket,
  ticketId: number,
  actor: ActorContext,
  roleId: number,
  workflow: TicketUpdateWorkflow,
  current: VisitStatus,
  now: Date,
  resolvePendingReason: () => Promise<string | null>,
): Promise<WorkflowResult> {
  const rawNext = cleanNullableString(workflow.status);
  if (!rawNext) throw new Error('status is required');

  const next = normalizeVisitStatus(rawNext);

  if (next === current) throw new Error('Ticket already has that status');
  if (current === 'CLOSE') throw new Error('Ticket already closed');
  if (next !== 'ESCALATED') throw new Error('Invalid status transition');

  if (!['ASSIGNED', 'ON_PROGRESS', 'PENDING'].includes(current)) {
    throw new Error('Invalid status transition');
  }
  if (ticket.teknisi_user_id == null) throw new Error('Ticket is not assigned');

  const previousReason =
    current === 'PENDING' ? await resolvePendingReason() : null;

  await upsertTracking(tx, {
    ticketId,
    assignedTo: ticket.teknisi_user_id,
    isActive: true,
    now,
    extra: { pendingReason: null },
  });

  await logStatusChange(tx, {
    ticketId,
    oldStatus: current,
    newStatus: 'ESCALATED',
    changedBy: actor.id_user,
    roleId,
    note: workflow.note ? String(workflow.note).trim() : 'Escalated',
  });

  await logActivity(tx, {
    ticketId,
    userId: actor.id_user,
    roleId,
    type: ActivityType.STATUS_CHANGE,
    description: truncate255(
      previousReason
        ? `Status change: ${current} -> ESCALATED | cleared reason: ${previousReason}`
        : `Status change: ${current} -> ESCALATED`,
    ),
  });

  const tech = await getTechnicianSnapshot(tx, ticket.teknisi_user_id);
  const ticketDetails = await getTicketDetails(tx, ticketId);
  const adminName = await getUserName(tx, actor.id_user);
  const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);
  await createTechEvent(
    {
      event_type: 'TICKET_STATUS_CHANGED',
      ticket: {
        id: ticketId,
        incident: ticket.INCIDENT,
        workzone: ticket.WORKZONE ?? '',
        service_no: ticketDetails?.service_no ?? '',
        customer_name: ticketDetails?.customer_name ?? '',
      },
      status: {
        old_hasil_visit: current,
        new_hasil_visit: 'ESCALATED',
        pending_reason: null,
        evidence,
        rca: null,
        sub_rca: null,
      },
      old_technician: tech,
      new_technician: tech,
      actor: { id_user: actor.id_user, role: actor.role },
      admin: { nama: adminName, action: 'ASSIGNED' },
    },
    tx,
  );

  return {
    ticketUpdate: {
      STATUS_UPDATE: 'escalated', // single source of truth
    },
    pendingReason: '',
  };
}

/**
 * Applies direct field patches from the `patch` input and returns the DB
 * update object, the list of changed field names, and any pending reason update.
 */
async function applyPatchFields(
  tx: Prisma.TransactionClient,
  patch: TicketUpdatePatch,
  ticket: LockedTicket,
  roleKey: string,
  ticketId: number,
  actor: ActorContext,
  now: Date,
): Promise<PatchResult> {
  const ticketUpdate: Record<string, unknown> = {};
  const patchChanges: string[] = [];
  let pendingReason: string | null | undefined;

  const current = normalizeVisitStatus(ticket.STATUS_UPDATE);

  // Simple scalar fields — map patch key → DB column
  const FIELD_MAP: Array<[keyof TicketUpdatePatch, string]> = [
    ['summary', 'SUMMARY'],
    ['ownerGroup', 'OWNER_GROUP'],
    ['status', 'STATUS'],
    ['serviceType', 'SERVICE_TYPE'],
    ['customerSegment', 'CUSTOMER_SEGMENT'],
    ['customerType', 'CUSTOMER_TYPE'],
    ['serviceNo', 'SERVICE_NO'],
    ['contactName', 'CONTACT_NAME'],
    ['contactPhone', 'CONTACT_PHONE'],
    ['deviceName', 'DEVICE_NAME'],
    ['symptom', 'SYMPTOM'],
    ['alamat', 'ALAMAT'],
    ['descriptionActualSolution', 'DESCRIPTION_ACTUAL_SOLUTION'],
  ];

  for (const [patchKey, dbKey] of FIELD_MAP) {
    if (patch[patchKey] !== undefined) {
      const cleaned = cleanNullableString(patch[patchKey]);
      if (patchKey === 'alamat' && typeof cleaned === 'string') {
        if (cleaned.length > 255) {
          throw new Error('Alamat maksimal 255 karakter');
        }
      }

      ticketUpdate[dbKey] = cleaned;
      patchChanges.push(patchKey);
    }
  }

  // pendingReason — admin-only, ticket must already be PENDING
  if (patch.pendingReason !== undefined) {
    if (roleKey === 'teknisi') throw new Error('Forbidden - Access denied');
    if (current !== 'PENDING') {
      throw new Error('pendingReason can only be set when ticket is PENDING');
    }

    const reason = cleanNullableString(patch.pendingReason);
    if (!reason) throw new Error('pendingReason is required');
    if (ticket.teknisi_user_id == null)
      throw new Error('Ticket is not assigned');

    const reasonDb = truncate255(reason);
    pendingReason = reasonDb;

    await upsertTracking(tx, {
      ticketId,
      assignedTo: ticket.teknisi_user_id,
      isActive: true,
      now,
      extra: { pendingAt: now, pendingReason: reasonDb },
    });

    patchChanges.push('pendingReason');
  }

  // workzone — admin-only, validates SA access and technician eligibility
  if (patch.workzone !== undefined) {
    if (roleKey === 'teknisi') throw new Error('Forbidden - Access denied');

    const newWorkzone = cleanNullableString(patch.workzone);
    if (!newWorkzone) throw new Error('workzone is required');

    const sa = await resolveServiceAreaForWorkzone(tx, newWorkzone);
    if (!sa) throw new Error('Ticket workzone is not mapped to a service area');

    if (roleKey === 'admin') {
      await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
    }

    if (ticket.teknisi_user_id != null) {
      await assertTechnicianEligibleForServiceArea(
        tx,
        ticket.teknisi_user_id,
        sa.id_sa,
      );
    }

    ticketUpdate.WORKZONE = newWorkzone;
    patchChanges.push('workzone');
  }

  return { ticketUpdate, patchChanges, pendingReason };
}

// ── Main Service ──────────────────────────────────────────────────────────────

export class TicketWorkflowService {
  static async getEligibleTechniciansByTicketId(
    ticketId: number,
    search?: string,
    actor?: ActorContext,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error('Invalid ticket id');
    }

    return prisma.$transaction(async (tx) => {
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

      if (actor) {
        const roleKey = normalizeRoleKey(actor.role);
        if (roleKey === 'admin') {
          await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
        }
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
        select: { id_user: true, nama: true, nik: true },
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
  }

  static async assignToUser(
    ticketId: number,
    technicianId: number,
    actor: ActorContext,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0)
      throw new Error('Invalid ticketId');

    if (!Number.isFinite(technicianId) || technicianId <= 0)
      throw new Error('Invalid teknisiUserId');

    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0)
      throw new Error('Unauthorized');

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['admin', 'helpdesk', 'superadmin']);

    const roleId = roleKeyToRoleId(roleKey);
    const now = new Date();

    return commitAndInvalidate(
      prisma.$transaction(async (tx) => {
        const ticket = await lockTicketRow(tx, ticketId);

        if (!ticket) throw new Error('Ticket not found');

        if (isTicketClosed(ticket.STATUS_UPDATE))
          throw new Error('Cannot assign a closed ticket');

        const current = normalizeVisitStatus(ticket.STATUS_UPDATE);

        if (current === 'CLOSE') throw new Error('Ticket already closed');

        if (current === 'ON_PROGRESS')
          throw new Error('Ticket is in progress and cannot be reassigned');

        assertTransition('ASSIGN', current);

        const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);

        if (!sa)
          throw new Error('Ticket workzone is not mapped to a service area');

        if (roleKey === 'admin') {
          await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
        }

        const techWithRole = await tx.users.findFirst({
          where: {
            id_user: technicianId,
            roles: { is: { key: 'teknisi' } },
            user_sa: { some: { sa_id: sa.id_sa } },
          },
          select: { id_user: true },
        });

        if (!techWithRole)
          throw new Error('Technician not eligible for this service area');

        if (ticket.teknisi_user_id === technicianId)
          throw new Error('Ticket already assigned to this technician');

        const isReassign = ticket.teknisi_user_id != null;
        const oldTechnicianId = ticket.teknisi_user_id;

        const assignNote = isReassign
          ? `Reassigned from #${oldTechnicianId} to #${technicianId}`
          : `Assigned to #${technicianId}`;

        await tx.ticket.update({
          where: { id_ticket: ticketId },
          data: {
            teknisi_user_id: technicianId,
            STATUS_UPDATE: 'assigned',
          },
        });

        await fastTrackingUpdate(tx, ticketId, technicianId, now);

        await deactivateAssignmentHistory(tx, ticketId, now);

        await tx.ticket_assignment_history.create({
          data: {
            ticket_id: ticketId,
            assigned_by: actor.id_user,
            assigned_to: technicianId,
            assigned_at: now,
            is_active: true,
          },
        });

        if (current !== 'ASSIGNED') {
          await logStatusChange(tx, {
            ticketId,
            oldStatus: current,
            newStatus: 'ASSIGNED',
            changedBy: actor.id_user,
            roleId,
            note: assignNote,
          });
        }

        await logActivity(tx, {
          ticketId,
          userId: actor.id_user,
          roleId,
          type: isReassign ? ActivityType.REASSIGN : ActivityType.ASSIGN,
          description: assignNote,
        });

        const tech = await getTechnicianSnapshot(tx, technicianId);

        const oldTech = oldTechnicianId
          ? await getTechnicianSnapshot(tx, oldTechnicianId)
          : null;

        const adminName = await getUserName(tx, actor.id_user);

        const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);

        await createTechEvent(
          {
            event_type: 'TICKET_ASSIGNED',
            ticket: {
              id: ticketId,
              incident: ticket.INCIDENT,
              workzone: ticket.WORKZONE ?? '',
              service_no: ticket.SERVICE_NO ?? '',
              customer_name: ticket.CONTACT_NAME ?? '',
            },
            status: {
              old_hasil_visit: current,
              new_hasil_visit: 'ASSIGNED',
              pending_reason: null,
              evidence,
              rca: null,
              sub_rca: null,
            },
            old_technician: oldTech,
            new_technician: tech,
            actor: { id_user: actor.id_user, role: actor.role },
            admin: {
              nama: adminName,
              action: isReassign ? 'REASSIGNED' : 'ASSIGNED',
            },
          },
          tx,
        );

        return {
          message: isReassign
            ? 'Ticket reassigned successfully'
            : 'Ticket assigned successfully',
        };
      }),
    );
  }

  static async unassignTicket(ticketId: number, actor: ActorContext) {
    if (!Number.isFinite(ticketId) || ticketId <= 0)
      throw new Error('Invalid ticketId');

    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0)
      throw new Error('Unauthorized');

    const roleKey = normalizeRoleKey(actor.role);

    assertRoleAllowed(roleKey, ['admin', 'helpdesk', 'superadmin']);

    const roleId = roleKeyToRoleId(roleKey);

    const now = new Date();

    return commitAndInvalidate(
      prisma.$transaction(async (tx) => {
        const ticket = await lockTicketRow(tx, ticketId);

        if (!ticket) throw new Error('Ticket not found');

        if (isTicketClosed(ticket.STATUS_UPDATE))
          throw new Error('Cannot unassign a closed ticket');

        const current = normalizeVisitStatus(ticket.STATUS_UPDATE);

        assertTransition('UNASSIGN', current);

        if (ticket.teknisi_user_id == null)
          throw new Error('Ticket is not assigned');

        const oldTechnicianId = ticket.teknisi_user_id;

        if (roleKey === 'admin') {
          const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);

          if (!sa) throw new Error('Unauthorized');

          await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
        }

        await tx.ticket.update({
          where: { id_ticket: ticketId },
          data: {
            teknisi_user_id: null,
            STATUS_UPDATE: 'open',
          },
        });

        await fastTrackingUpdate(tx, ticketId, null, now);

        await deactivateAssignmentHistory(tx, ticketId, now);

        await logStatusChange(tx, {
          ticketId,
          oldStatus: 'ASSIGNED',
          newStatus: 'OPEN',
          changedBy: actor.id_user,
          roleId,
          note: `Unassigned from #${oldTechnicianId}`,
        });

        await logActivity(tx, {
          ticketId,
          userId: actor.id_user,
          roleId,
          type: ActivityType.STATUS_CHANGE,
          description: `Unassigned from #${oldTechnicianId}`,
        });

        const tech = await getTechnicianSnapshot(tx, oldTechnicianId);

        const adminName = await getUserName(tx, actor.id_user);

        const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);

        await createTechEvent(
          {
            event_type: 'TICKET_UNASSIGNED',
            ticket: {
              id: ticketId,
              incident: ticket.INCIDENT,
              workzone: ticket.WORKZONE ?? '',
              service_no: ticket.SERVICE_NO ?? '',
              customer_name: ticket.CONTACT_NAME ?? '',
            },
            status: {
              old_hasil_visit: current,
              new_hasil_visit: 'OPEN',
              pending_reason: null,
              evidence,
              rca: null,
              sub_rca: null,
            },
            old_technician: tech,
            new_technician: null,
            actor: { id_user: actor.id_user, role: actor.role },
            admin: { nama: adminName, action: 'UNASSIGNED' },
          },
          tx,
        );

        return { message: 'Ticket unassigned successfully' };
      }),
    );
  }

  static async pickupTicket(ticketId: number, actor: ActorContext) {
    if (!Number.isFinite(ticketId) || ticketId <= 0)
      throw new Error('ticketId is required');
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0)
      throw new Error('Unauthorized');

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['teknisi']);
    const roleId = roleKeyToRoleId(roleKey);
    const now = new Date();

    return commitAndInvalidate(
      prisma.$transaction(async (tx) => {
        const ticket = await lockTicketRow(tx, ticketId);
        if (!ticket) throw new Error('Ticket not found');

        // Guard: Check if ticket is closed using STATUS_UPDATE
        if (isTicketClosed(ticket.STATUS_UPDATE)) {
          throw new Error('Cannot update a closed ticket');
        }

        if (ticket.teknisi_user_id == null)
          throw new Error('Ticket is not assigned');
        if (ticket.teknisi_user_id !== actor.id_user)
          throw new Error('Unauthorized');

        const current = normalizeVisitStatus(ticket.STATUS_UPDATE);
        assertTransition('PICKUP', current);

        await tx.ticket.update({
          where: { id_ticket: ticketId },
          data: {
            STATUS_UPDATE: 'on_progress', // single source of truth
          },
        });

        await upsertTracking(tx, {
          ticketId,
          assignedTo: actor.id_user,
          isActive: true,
          now,
          extra: { pickedUpAt: now, onProgressAt: now },
        });

        await logStatusChange(tx, {
          ticketId,
          oldStatus: 'ASSIGNED',
          newStatus: 'ON_PROGRESS',
          changedBy: actor.id_user,
          roleId,
          note: 'Pickup -> ON_PROGRESS',
        });

        await logActivity(tx, {
          ticketId,
          userId: actor.id_user,
          roleId,
          type: ActivityType.STATUS_CHANGE,
          description: 'Pickup -> ON_PROGRESS',
        });

        const adminName = await getUserName(tx, actor.id_user);
        const tech = await getTechnicianSnapshot(tx, actor.id_user);
        const ticketDetails = await getTicketDetails(tx, ticketId);
        const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);
        await createTechEvent(
          {
            event_type: 'TICKET_STATUS_CHANGED',
            ticket: {
              id: ticketId,
              incident: ticket.INCIDENT,
              workzone: ticket.WORKZONE ?? '',
              service_no: ticketDetails?.service_no ?? '',
              customer_name: ticketDetails?.customer_name ?? '',
            },
            status: {
              old_hasil_visit: 'ASSIGNED',
              new_hasil_visit: 'ON_PROGRESS',
              pending_reason: null,
              evidence,
            },
            old_technician: tech,
            new_technician: tech,
            actor: { id_user: actor.id_user, role: actor.role },
            admin: { nama: adminName, action: 'ASSIGNED' },
          },
          tx,
        );

        return { message: 'Ticket picked up successfully' };
      }),
    );
  }

  static async closeTicket(
    ticketId: number,
    actor: ActorContext,
    rca: string,
    subRca: string,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0)
      throw new Error('Ticket ID wajib diisi');

    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0)
      throw new Error('Unauthorized');

    const roleKey = normalizeRoleKey(actor.role);

    assertRoleAllowed(roleKey, ['teknisi']);

    const roleId = roleKeyToRoleId(roleKey);

    const now = new Date();

    const rcaValue = String(rca ?? '').trim();
    const subRcaValue = String(subRca ?? '').trim();

    if (!rcaValue || !subRcaValue)
      throw new Error('RCA dan Sub RCA wajib diisi');

    return commitAndInvalidate(
      prisma.$transaction(async (tx) => {
        const ticket = await lockTicketRow(tx, ticketId);

        if (!ticket) throw new Error('Ticket not found');

        if (isTicketClosed(ticket.STATUS_UPDATE))
          throw new Error('Ticket already closed');

        if (ticket.teknisi_user_id !== actor.id_user)
          throw new Error('Unauthorized');

        const current = normalizeVisitStatus(ticket.STATUS_UPDATE);

        assertTransition('CLOSE', current);

        const alamat = cleanNullableString(ticket.ALAMAT);

        if (!alamat) throw new Error('Alamat wajib diisi sebelum close');

        const evidenceCount = await tx.ticket_evidence.count({
          where: { ticket_id: ticketId },
        });

        if (evidenceCount < 2)
          throw new Error('Minimal 2 evidence wajib sebelum close');

        await tx.ticket.update({
          where: { id_ticket: ticketId },
          data: {
            STATUS_UPDATE: 'close',
            rca: rcaValue,
            sub_rca: subRcaValue,
            closed_at: now,
          },
        });

        await fastTrackingUpdate(tx, ticketId, actor.id_user, now);

        await deactivateAssignmentHistory(tx, ticketId, now);

        await logStatusChange(tx, {
          ticketId,
          oldStatus: ticket.STATUS_UPDATE ?? 'open',
          newStatus: 'close',
          changedBy: actor.id_user,
          roleId,
          note: 'Ticket closed',
        });

        await logActivity(tx, {
          ticketId,
          userId: actor.id_user,
          roleId,
          type: ActivityType.CLOSE,
          description: 'Ticket closed',
        });

        // Use centralized evidence builder (consistent with other workflow functions)
        const evidenceData = await buildTechEventEvidence(ticket.INCIDENT, tx);

        const tech = await getTechnicianSnapshot(tx, actor.id_user);

        const adminInfo = await getLatestAdminAssignment(tx, ticketId);

        await createTechEvent(
          {
            event_type: 'TICKET_CLOSED',
            ticket: {
              id: ticketId,
              incident: ticket.INCIDENT,
              workzone: ticket.WORKZONE ?? '',
              service_no: ticket.SERVICE_NO ?? '',
              customer_name: ticket.CONTACT_NAME ?? '',
            },
            status: {
              old_hasil_visit: 'ON_PROGRESS',
              new_hasil_visit: 'DONE',
              pending_reason: null,
              evidence: evidenceData,
              rca: rcaValue,
              sub_rca: subRcaValue,
            },
            old_technician: tech,
            new_technician: tech,
            actor: { id_user: actor.id_user, role: actor.role },
            admin: adminInfo
              ? { nama: adminInfo.nama, action: 'ASSIGNED' }
              : null,
          },
          tx,
        );

        return { message: 'Ticket closed successfully' };
      }),
    );
  }

  static async updateTicket(
    ticketId: number,
    actor: ActorContext,
    input: UpdateTicketInput,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0)
      throw new Error('Invalid ticketId');
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0)
      throw new Error('Unauthorized');

    const roleKey = normalizeRoleKey(actor.role);
    assertRoleAllowed(roleKey, ['admin', 'helpdesk', 'superadmin', 'teknisi']);
    const roleId = roleKeyToRoleId(roleKey);

    const patch = input.patch ?? {};
    const workflow = input.workflow;
    const hasWorkflowStatus = workflow?.status !== undefined;

    // Validate patch keys against role permissions up-front
    const TEKNISI_PATCH_KEYS = ['descriptionActualSolution', 'alamat'] as const;
    const ADMIN_PATCH_KEYS = [
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
    ] as const;

    const allowedKeys =
      roleKey === 'teknisi' ? TEKNISI_PATCH_KEYS : ADMIN_PATCH_KEYS;
    const attemptedKeys = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== undefined,
    );

    for (const key of attemptedKeys) {
      if (!(allowedKeys as readonly string[]).includes(key)) {
        throw new Error('Forbidden - Access denied');
      }
    }

    if (attemptedKeys.length === 0 && !hasWorkflowStatus) {
      throw new Error('No updates provided');
    }

    const now = new Date();

    return commitAndInvalidate(
      prisma.$transaction(async (tx) => {
        const ticket = await lockTicketRow(tx, ticketId);
        if (!ticket) throw new Error('Ticket not found');

        // Guard: Check if ticket is closed using STATUS_UPDATE
        if (isTicketClosed(ticket.STATUS_UPDATE)) {
          throw new Error('Cannot update a closed ticket');
        }

        const current = normalizeVisitStatus(ticket.STATUS_UPDATE);

        // Role-based access guards
        if (roleKey === 'admin') {
          const sa = await resolveServiceAreaForWorkzone(tx, ticket.WORKZONE);
          if (!sa) throw new Error('Unauthorized');
          await assertAdminHasAccessToServiceArea(tx, actor.id_user, sa.id_sa);
        }

        if (roleKey === 'teknisi') {
          if (
            ticket.teknisi_user_id == null ||
            ticket.teknisi_user_id !== actor.id_user
          )
            throw new Error('Unauthorized');
          if (current === 'CLOSE') throw new Error('Ticket already closed');
          if (current !== 'ON_PROGRESS' && current !== 'PENDING')
            throw new Error('Ticket must be ON_PROGRESS before updating');
        }

        // Lazily fetch pending reason when needed (avoids an extra query otherwise)
        const resolvePendingReason = async (): Promise<string | null> => {
          const fromTicket = cleanNullableString(ticket.PENDING_REASON);
          if (fromTicket) return fromTicket;

          const row = await tx.ticket_tracking.findUnique({
            where: { ticket_id: ticketId },
            select: { pending_reason: true },
          });
          return cleanNullableString(row?.pending_reason) ?? null;
        };

        // Apply direct field patches
        const {
          ticketUpdate,
          patchChanges,
          pendingReason: patchPendingReason,
        } = await applyPatchFields(
          tx,
          patch,
          ticket,
          roleKey,
          ticketId,
          actor,
          now,
        );

        // Apply workflow status transition
        let workflowPendingReason: string | null | undefined;

        if (hasWorkflowStatus) {
          const result = await (roleKey === 'teknisi'
            ? handleTechnicianWorkflow(
                tx,
                ticket,
                ticketId,
                actor,
                roleId,
                workflow!,
                current,
                now,
                resolvePendingReason,
              )
            : handleAdminWorkflow(
                tx,
                ticket,
                ticketId,
                actor,
                roleId,
                workflow!,
                current,
                now,
                resolvePendingReason,
              ));

          Object.assign(ticketUpdate, result.ticketUpdate);
          workflowPendingReason = result.pendingReason;
        }

        // Persist ticket column changes
        if (Object.keys(ticketUpdate).length > 0) {
          await tx.ticket.update({
            where: { id_ticket: ticketId },
            data: ticketUpdate as any,
          });
        }

        // PENDING_REASON uses a raw query because the column may be NOT NULL
        // in some deployments, and Prisma would skip a `null` update.
        const finalPendingReason =
          workflowPendingReason !== undefined
            ? workflowPendingReason
            : patchPendingReason;

        if (finalPendingReason !== undefined) {
          await tx.$executeRaw`
          UPDATE ticket
          SET PENDING_REASON = ${finalPendingReason}
          WHERE id_ticket = ${ticketId}
        `;
        }

        if (patchChanges.length > 0) {
          await logActivity(tx, {
            ticketId,
            userId: actor.id_user,
            roleId,
            type: ActivityType.COMMENT,
            description: `Updated fields: ${patchChanges.join(', ')}`,
          });
        }

        return { message: 'Ticket updated successfully' };
      }),
    );
  }

  static async logEvidenceUpload(
    ticketId: number,
    actor: ActorContext,
    fileCount: number,
  ) {
    if (!Number.isFinite(ticketId) || ticketId <= 0)
      throw new Error('Invalid ticketId');
    if (!Number.isFinite(actor?.id_user) || actor.id_user <= 0)
      throw new Error('Unauthorized');

    const roleKey = normalizeRoleKey(actor.role);
    const roleId = roleKeyToRoleId(roleKey);
    const count = Number.isFinite(fileCount) ? Math.max(0, fileCount) : 0;

    await prisma.ticket_activity_log.create({
      data: {
        ticket_id: ticketId,
        user_id: actor.id_user,
        role_id: roleId,
        activity_type: ActivityType.UPLOAD_EVIDENCE,
        description: `Uploaded ${count} evidence file(s)`,
      },
    });
  }
}
