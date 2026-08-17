// app/services/ticket.helpers.ts

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCache } from '@/lib/cache';
import { normalizeRoleKey } from '@/app/libs/roles';

// ── ActivityType enum (defined locally since Prisma types aren't generated) ──
export enum ActivityType {
  ASSIGN = 'ASSIGN',
  REASSIGN = 'REASSIGN',
  STATUS_CHANGE = 'STATUS_CHANGE',
  COMMENT = 'COMMENT',
  UPLOAD_EVIDENCE = 'UPLOAD_EVIDENCE',
  CLOSE = 'CLOSE',
  AUTO_ASSIGN = 'AUTO_ASSIGN',
}

// ── Workzone ──────────────────────────────────────────────────────────────────
export async function getWorkzonesForUser(userId: number): Promise<string[]> {
  return getOrSetCache(
    `ticket_helpers:workzones:${userId}`,
    async () => {
      const [directSas, areaSas, branchSas, regionSas] = await Promise.all([
        prisma.user_sa.findMany({
          where: { user_id: userId },
          include: { service_area: { select: { nama_sa: true } } },
        }),
        prisma.user_area.findMany({
          where: { user_id: userId },
          include: {
            area: {
              include: { service_area: { select: { nama_sa: true } } },
            },
          },
        }),
        prisma.user_branch.findMany({
          where: { user_id: userId },
          include: {
            branch: {
              include: {
                areas: {
                  include: { service_area: { select: { nama_sa: true } } },
                },
              },
            },
          },
        }),
        prisma.user_region.findMany({
          where: { user_id: userId },
          include: {
            region: {
              include: {
                branches: {
                  include: {
                    areas: {
                      include: { service_area: { select: { nama_sa: true } } },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

      const names = new Set<string>();

      directSas.forEach((us) => {
        if (us.service_area?.nama_sa) names.add(us.service_area.nama_sa);
      });
      areaSas.forEach((ua) => {
        ua.area?.service_area.forEach((sa) => {
          if (sa.nama_sa) names.add(sa.nama_sa);
        });
      });
      branchSas.forEach((ub) => {
        ub.branch?.areas.forEach((a) =>
          a.service_area.forEach((sa) => {
            if (sa.nama_sa) names.add(sa.nama_sa);
          }),
        );
      });
      regionSas.forEach((ur) => {
        ur.region?.branches.forEach((b) =>
          b.areas.forEach((a) =>
            a.service_area.forEach((sa) => {
              if (sa.nama_sa) names.add(sa.nama_sa);
            }),
          ),
        );
      });

      return [...names];
    },
    3600,
  );
}

export async function resolveWorkzoneName(
  saId: number,
): Promise<string | null> {
  return getOrSetCache(
    `ticket_helpers:workzone_name:${saId}`,
    async () => {
      const sa = await prisma.service_area.findUnique({ where: { id_sa: saId } });
      return sa?.nama_sa ?? null;
    },
    3600,
  );
}

// ── Branch ────────────────────────────────────────────────────────────────────
export type BranchOption = {
  id_branch: number;
  nama_branch: string;
  kode_branch: string;
  region_id: number | null;
};

const BRANCH_SELECT = {
  id_branch: true,
  nama_branch: true,
  kode_branch: true,
  region_id: true,
} as const;

export async function getBranchesForUser(
  userId: number,
  role: string,
): Promise<BranchOption[]> {
  const allBranches = () =>
    prisma.branch.findMany({
      select: BRANCH_SELECT,
      orderBy: { nama_branch: 'asc' },
    });

  if (normalizeRoleKey(role) === 'superadmin') {
    return allBranches();
  }

  return getOrSetCache(
    `ticket_helpers:branches:${userId}`,
    async () => {
      const byId = new Map<number, BranchOption>();
      const add = (b: BranchOption | null | undefined) => {
        if (b && !byId.has(b.id_branch)) byId.set(b.id_branch, b);
      };

      const [directBranches, areaBranches] = await Promise.all([
        prisma.user_branch.findMany({
          where: { user_id: userId },
          select: {
            branch: { select: BRANCH_SELECT },
          },
        }),
        normalizeRoleKey(role) === 'admin_branch'
          ? prisma.users.findUnique({
              where: { id_user: userId },
              select: {
                area: { select: { branch: { select: BRANCH_SELECT } } },
              },
            })
          : Promise.resolve(null),
      ]);

      directBranches.forEach((ub) => add(ub.branch));
      if (areaBranches) add(areaBranches.area?.branch);

      return [...byId.values()].sort((a, b) => a.nama_branch.localeCompare(b.nama_branch));
    },
    3600,
  );
}

export async function getBranchServiceAreaNames(branchId: number): Promise<string[]> {
  return getOrSetCache(
    `ticket_helpers:branch_sa_names:${branchId}`,
    async () => {
      const areas = await prisma.area.findMany({
        where: { branch_id: branchId },
        select: {
          service_area: { select: { nama_sa: true } },
        },
      });

      const names = new Set<string>();
      areas.forEach((a) =>
        a.service_area.forEach((sa) => {
          if (sa.nama_sa) names.add(sa.nama_sa);
        }),
      );
      return [...names];
    },
    3600,
  );
}

export async function resolveBranchScope(
  role: string,
  userId: number,
  branchParam?: string | null,
): Promise<string[] | null> {
  if (!branchParam) return null;

  const id = Number(branchParam);
  if (!Number.isFinite(id) || id <= 0) return [];

  if (normalizeRoleKey(role) !== 'superadmin') {
    const branches = await getBranchesForUser(userId, role);
    if (!branches.some((b) => b.id_branch === id)) return [];
  }

  return getBranchServiceAreaNames(id);
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
    pendingDompis: string | null;
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
    ...(p.extra?.pendingDompis !== undefined && {
      pending_dompis: p.extra.pendingDompis,
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
