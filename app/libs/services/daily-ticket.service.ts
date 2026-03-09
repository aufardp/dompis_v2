import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';

import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';
import { getJenisWhereClause } from '@/lib/jenis';

type TicketFilters = {
  search?: string;
  statusUpdate?: string;
  dept?: string;
  ticketType?: string;
  workzone?: number | string;
  ctype?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
};

function normalizeStatusUpdateFilter(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Status filter helper
 */
function applyStatusUpdateWhere(
  where: Record<string, any>,
  statusUpdate?: string,
) {
  const su = normalizeStatusUpdateFilter(statusUpdate);

  if (!su || su === 'all') return;

  if (su === 'open') {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [{ STATUS_UPDATE: null }, { STATUS_UPDATE: 'open' }],
      },
    ];

    return;
  }

  where.STATUS_UPDATE = su;
}

/**
 * Ticket mapper
 */

function mapTicket(t: any) {
  return {
    idTicket: t.id_ticket,
    ticket: t.INCIDENT,
    summary: t.SUMMARY,
    reportedDate: t.REPORTED_DATE,
    ownerGroup: t.OWNER_GROUP,
    serviceType: t.SERVICE_TYPE,
    customerType: t.CUSTOMER_TYPE,
    ctype: t.CUSTOMER_TYPE || undefined,
    serviceNo: t.SERVICE_NO,
    contactName: t.CONTACT_NAME,
    contactPhone: t.CONTACT_PHONE,
    deviceName: t.DEVICE_NAME,
    status: t.STATUS,
    STATUS_UPDATE: (() => {
      const v = String(t.STATUS_UPDATE ?? '')
        .trim()
        .toLowerCase();
      return v || null;
    })(),
    hasilVisit: t.STATUS_UPDATE,
    bookingDate: t.BOOKING_DATE,
    symptom: t.SYMPTOM,
    descriptionActualSolution: t.DESCRIPTION_ACTUAL_SOLUTION,
    workzone: t.WORKZONE,
    customerSegment: t.CUSTOMER_SEGMENT,
    sourceTicket: t.SOURCE_TICKET,
    jenisTiket: t.JENIS_TIKET,
    flaggingManja: t.FLAGGING_MANJA,
    guaranteeStatus: t.GUARANTE_STATUS,
    pendingReason: t.PENDING_REASON,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.ALAMAT,
    closedAt: t.closed_at,
    technicianName: t.users?.nama,
    syncDate: t.sync_date,
    syncedAt: t.synced_at,
    importBatch: t.import_batch,
  };
}

export class DailyTicketService {
  /**
   * Get latest operational sync_date from DB
   */
  private static async getLatestSyncDate(
    tx?: Prisma.TransactionClient,
  ): Promise<Date | null> {
    const db = tx ?? prisma;

    const result = await db.ticket.aggregate({
      _max: { sync_date: true },
    });

    return result._max.sync_date ?? null;
  }

  /**
   * Daily filter
   *
   * tickets from latest operational sync_date OR pending
   *
   * Uses MAX(sync_date) from DB as reference (not server time) to avoid
   * timezone mismatch. Server may be UTC while data is WIB-based.
   */
  static async applyDailyTicketFilter(
    where: Record<string, any>,
    tx?: Prisma.TransactionClient,
    latestSyncDateOverride?: Date | null,
  ) {
    const latestSyncDate =
      latestSyncDateOverride !== undefined
        ? latestSyncDateOverride
        : await DailyTicketService.getLatestSyncDate(tx);

    if (!latestSyncDate) {
      where.AND = [...(where.AND ?? []), { sync_date: null }];
      return;
    }

    // Use latestSyncDate directly from DB (already a DATE column value).
    // Prisma returns DATE columns as midnight UTC for that date.
    // E.g., sync_date='2026-03-09' → Date(2026-03-09T00:00:00.000Z)
    const startOfDay = new Date(latestSyncDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          {
            sync_date: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
          {
            AND: [
              {
                PENDING_REASON: {
                  not: null,
                },
              },
              {
                PENDING_REASON: {
                  not: '',
                },
              },
            ],
          },
        ],
      },
    ];
  }

  /**
   * Workzone filter
   */

  private static async buildWorkzoneWhere(
    role: string,
    userId: number,
    selectedWorkzone?: string | null,
  ): Promise<Record<string, any>> {
    if (role === 'teknisi') {
      const where: Record<string, any> = {
        teknisi_user_id: userId,
      };

      if (selectedWorkzone) {
        where.WORKZONE = { contains: selectedWorkzone };
      }

      return where;
    }

    if (isAdminRole(role)) {
      const workzones = await getWorkzonesForUser(userId);

      if (workzones.length === 0) {
        return {};
      }

      if (selectedWorkzone) {
        return workzones.includes(selectedWorkzone)
          ? { WORKZONE: { contains: selectedWorkzone } }
          : { id_ticket: 0 };
      }

      return {
        WORKZONE: { in: workzones },
      };
    }

    return {};
  }

  private static async resolveSelectedWorkzone(
    saId?: number | string,
  ): Promise<string | null> {
    const id = Number(saId);

    if (!Number.isFinite(id) || id <= 0) return null;

    return resolveWorkzoneName(id);
  }

  /**
   * Optimized Status Counter
   *
   * Replaces 6 COUNT queries
   */

  static async countStatuses(where: Record<string, any>) {
    const grouped = await prisma.ticket.groupBy({
      by: ['STATUS_UPDATE'],
      where,
      _count: {
        STATUS_UPDATE: true,
      },
    });

    const stats: any = {
      total: 0,
      open: 0,
      assigned: 0,
      onProgress: 0,
      pending: 0,
      close: 0,
    };

    for (const g of grouped) {
      const count = g._count.STATUS_UPDATE;

      stats.total += count;

      const status = (g.STATUS_UPDATE ?? 'open').toLowerCase();

      if (status === 'open') stats.open += count;
      if (status === 'assigned') stats.assigned += count;
      if (status === 'on_progress') stats.onProgress += count;
      if (status === 'pending') stats.pending += count;
      if (status === 'close') stats.close += count;
    }

    stats.unassigned = stats.open;

    return stats;
  }

  /**
   * Main Daily Ticket Table
   */

  static async getDailyTicketTable(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const {
      search = '',
      statusUpdate,
      dept,
      ticketType,
      workzone,
      ctype,
      page = 1,
      limit = 20,
      sort = 'asc',
    } = filters ?? {};

    const offset = (page - 1) * limit;

    const selectedWorkzone = await this.resolveSelectedWorkzone(workzone);

    const where: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(role, userId, selectedWorkzone)),
    };

    await this.applyDailyTicketFilter(where);

    if (search) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { INCIDENT: { contains: search } },
            { CONTACT_NAME: { contains: search } },
            { SERVICE_NO: { contains: search } },
            { CONTACT_PHONE: { contains: search } },
          ],
        },
      ];
    }

    if (statusUpdate) {
      applyStatusUpdateWhere(where, statusUpdate);
    }

    if (ctype) {
      where.CUSTOMER_TYPE = ctype;
    }

    if (ticketType && ticketType !== 'all') {
      Object.assign(where, getJenisWhereClause(ticketType));
    }

    // Apply dept filter (B2B/B2C)
    if (dept && dept !== 'all') {
      const B2C_CTYPES = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND'];
      if (dept === 'b2c') {
        where.CUSTOMER_TYPE = { in: B2C_CTYPES };
      } else if (dept === 'b2b') {
        where.AND = [
          ...(where.AND ?? []),
          {
            OR: [
              { CUSTOMER_TYPE: { notIn: B2C_CTYPES } },
              { CUSTOMER_TYPE: null },
            ],
          },
        ];
      }
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),

      prisma.ticket.findMany({
        where,

        include: {
          users: {
            select: { nama: true },
          },
        },

        orderBy: [{ REPORTED_DATE: sort }, { id_ticket: 'asc' }],

        skip: offset,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: tickets.map(mapTicket),
    };
  }

  /**
   * Daily Stats
   */

  static async getDailyStats(
    role: string,
    userId: number,
    saId?: number,
    p0?: {
      dept: string | undefined;
      ticketType: string | undefined;
      statusUpdate: string | undefined;
    },
  ) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);

    const where = await this.buildWorkzoneWhere(role, userId, selectedWorkzone);

    await this.applyDailyTicketFilter(where);

    // Apply dept filter (B2B/B2C)
    if (p0?.dept && p0.dept !== 'all') {
      const B2C_CTYPES = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND'];
      if (p0.dept === 'b2c') {
        where.CUSTOMER_TYPE = { in: B2C_CTYPES };
      } else if (p0.dept === 'b2b') {
        where.AND = [
          ...(where.AND ?? []),
          {
            OR: [
              { CUSTOMER_TYPE: { notIn: B2C_CTYPES } },
              { CUSTOMER_TYPE: null },
            ],
          },
        ];
      }
    }

    // Apply ticketType filter
    if (p0?.ticketType && p0.ticketType !== 'all') {
      Object.assign(where, getJenisWhereClause(p0.ticketType));
    }

    // Apply statusUpdate filter
    if (p0?.statusUpdate && p0.statusUpdate !== 'all') {
      applyStatusUpdateWhere(where, p0.statusUpdate);
    }

    return this.countStatuses(where);
  }

  /**
   * Daily Stats by Service Area
   */

  static async getDailyStatsByServiceArea(
    role: string,
    userId: number,
    saId?: number,
    options?: { dept?: string; ticketType?: string; statusUpdate?: string },
  ): Promise<
    Array<{
      id_sa: number;
      nama_sa: string;
      total: number;
      unassigned: number;
      open: number;
      assigned: number;
      onProgress: number;
      pending: number;
      close: number;
    }>
  > {
    const workzones = isAdminRole(role)
      ? await getWorkzonesForUser(userId)
      : [];

    if (workzones.length === 0) return [];

    const serviceAreas = await prisma.service_area.findMany({
      where: {
        nama_sa: { in: workzones },
      },
      select: {
        id_sa: true,
        nama_sa: true,
      },
    });

    if (serviceAreas.length === 0) return [];

    const results = await Promise.all(
      serviceAreas.map(async (sa) => {
        const where: Record<string, any> = {
          WORKZONE: { contains: sa.nama_sa },
        };

        await this.applyDailyTicketFilter(where);

        if (options?.statusUpdate && options.statusUpdate !== 'all') {
          applyStatusUpdateWhere(where, options.statusUpdate);
        }

        if (options?.dept && options.dept !== 'all') {
          const { getJenisWhereClause } = await import('@/lib/jenis');
          const jenisClause = getJenisWhereClause(options.dept);
          Object.assign(where, jenisClause);
        }

        if (options?.ticketType && options.ticketType !== 'all') {
          const { getJenisWhereClause } = await import('@/lib/jenis');
          const jenisClause = getJenisWhereClause(options.ticketType);
          Object.assign(where, jenisClause);
        }

        const statusCounts = await this.countStatuses(where);

        return {
          id_sa: sa.id_sa,
          nama_sa: sa.nama_sa ?? '',
          total: statusCounts.total,
          unassigned: statusCounts.unassigned,
          open: statusCounts.open,
          assigned: statusCounts.assigned,
          onProgress: statusCounts.onProgress ?? 0,
          pending: statusCounts.pending ?? 0,
          close: statusCounts.close,
        };
      }),
    );

    return results.sort((a, b) => b.total - a.total);
  }

  /**
   * Workflow delegation
   */

  static async assignToUser(
    ticketId: number,
    teknisiUserId: number,
    actor: ActorContext,
  ) {
    return TicketWorkflowService.assignToUser(ticketId, teknisiUserId, actor);
  }

  static async unassign(ticketId: number, role?: string, userId?: number) {
    if (!role || !userId) {
      throw new Error('Unauthorized');
    }

    return TicketWorkflowService.unassignTicket(ticketId, {
      id_user: userId,
      role,
    });
  }

  static async pickup(ticketId: number, teknisiUserId: number) {
    return TicketWorkflowService.pickupTicket(ticketId, {
      id_user: teknisiUserId,
      role: 'teknisi',
    });
  }

  static async close(
    ticketId: number,
    teknisiUserId: number,
    rca: string,
    subRca: string,
  ) {
    return TicketWorkflowService.closeTicket(
      ticketId,
      { id_user: teknisiUserId, role: 'teknisi' },
      rca,
      subRca,
    );
  }
}
