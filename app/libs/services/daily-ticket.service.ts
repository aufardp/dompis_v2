import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';

import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';
import { getJenisWhereClause, getB2CJenisWhereClause, getB2BJenisWhereClause } from '@/app/config/jenis-tiket';
import { toWibString, toWibDateString, todayWibDateForDb, getTodayWibRange } from '@/lib/timezone';
import { resolveEffectiveFlagging } from '../flagging-manja';

type TicketFilters = {
  search?: string;
  statusUpdate?: string | string[];
  dept?: string;
  ticketType?: string | string[];
  flagging?: string | string[];
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

function normalizeStringList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0 && item.toLowerCase() !== 'all');
}

/**
 * Status filter helper
 */
function applyStatusUpdateWhere(
  where: Record<string, any>,
  statusUpdate?: string | string[],
) {
  const statuses = normalizeStringList(statusUpdate).map((item) =>
    normalizeStatusUpdateFilter(item),
  );

  if (statuses.length === 0) return;

  const clauses = statuses.map((status) => {
    if (status === 'open') {
      return { OR: [{ status_update: null }, { status_update: 'open' }] };
    }
    return { status_update: status };
  });

  if (clauses.length === 1) {
    where.AND = [...(where.AND ?? []), clauses[0]];
    return;
  }

  where.AND = [...(where.AND ?? []), { OR: clauses }];
}

function applyTicketTypeWhere(
  where: Record<string, any>,
  ticketType?: string | string[],
) {
  const ticketTypes = normalizeStringList(ticketType);
  if (ticketTypes.length === 0) return;

  const variants = new Set<string>();
  for (const type of ticketTypes) {
    const clause = getJenisWhereClause(type);
    for (const value of clause.jenis_tiket_2.in) {
      variants.add(value);
    }
  }

  where.jenis_tiket_2 = { in: [...variants] };
}

function applyFlaggingWhere(
  where: Record<string, any>,
  flagging?: string | string[],
) {
  const flags = normalizeStringList(flagging).map((item) => item.toUpperCase());
  if (flags.length === 0) return;

  const clauses: Record<string, any>[] = [];
  if (flags.includes('P1')) clauses.push({ flagging_manja: 'P1' });
  if (flags.includes('P+')) clauses.push({ flagging_manja: 'P+' });
  if (flags.includes('FFG')) clauses.push({ guarantee_status: 'guarantee' });
  if (flags.includes('GAMAS')) {
    clauses.push({
      AND: [
        { ticket_id_gamas: { not: null } },
        { ticket_id_gamas: { not: '' } },
        { ticket_id_gamas: { not: '-' } },
        { ticket_id_gamas: { not: '--' } },
      ],
    });
  }

  if (clauses.length === 0) return;
  where.AND = [
    ...(where.AND ?? []),
    clauses.length === 1 ? clauses[0] : { OR: clauses },
  ];
}

/**
 * Ticket mapper
 */

function mapTicket(t: any) {
  return {
    idTicket: t.id_ticket,
    ticket: t.incident,
    summary: t.summary,
    reportedDate: toWibString(t.reported_date),
    ownerGroup: t.owner_group,
    serviceType: t.service_type,
    customerType: t.customer_type,
    ctype: t.customer_type || undefined,
    serviceNo: t.service_no,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    deviceName: t.device_name,
    status: t.status,
    status_update: (() => {
      const v = String(t.status_update ?? '')
        .trim()
        .toLowerCase();
      return v || null;
    })(),
    hasilVisit: t.status_update,
    bookingDate: toWibString(t.booking_date),
    symptom: t.symptom,
    descriptionActualSolution: t.description_actual_solution,
    descriptionSolutionDompis: t.description_solution_dompis,
    workzone: t.workzone,
    customerSegment: t.customer_segment,
    sourceTicket: t.source_ticket,
    jenisTiket: t.jenis_tiket_2,
    jenisTiket1: t.jenis_tiket_1,
    flaggingManja: resolveEffectiveFlagging(t.flagging_manja, t.booking_date),
    ticketIdGamas: t.ticket_id_gamas ?? null,
    guaranteeStatus: t.guarantee_status,
    pendingDompis: t.pending_dompis,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.alamat,
    closedAt: toWibString(t.closed_at),
    technicianName: t.users?.nama,
    worklogSummary: t.worklog_summary,
    syncDate: toWibDateString(t.sync_date),
    syncedAt: toWibString(t.synced_at),
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
   * Daily filter for the operational board.
   * - Tickets synced today AND NOT fully closed in backend (status != 'closed') OR
   * - Tickets synced today that were closed TODAY (closed_at >= today start WIB) OR
   * - Carry-over tickets with pending_dompis (not yet closed)
   *
   * This ensures:
   * 1. Active tickets appear on the board
   * 2. Tickets closed today still appear (with closed indicator)
   * 3. Old closed tickets that get re-synced do NOT appear
   */
  static async applyDailyTicketFilter(
    where: Record<string, any>,
    tx?: Prisma.TransactionClient,
  ) {
    const today = todayWibDateForDb();
    const { start: todayStart } = getTodayWibRange();
    
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          // Active tickets synced today (not closed)
          {
            AND: [
              { sync_date: today },
              { status: { not: 'closed' } },
            ],
          },
          // Tickets closed today (closed_at >= today start in WIB)
          {
            AND: [
              { sync_date: today },
              { status: 'closed' },
              { closed_at: { gte: todayStart } },
            ],
          },
          // Tickets with status_update = 'close' AND status = 'closed' synced today
          // (newly closed via Dompis workflow, visible today then gone tomorrow)
          {
            AND: [
              { sync_date: today },
              { status_update: 'close' },
              { status: 'closed' },
            ],
          },
          // Carry-over with pending_dompis (not yet closed)
          {
            AND: [
              { pending_dompis: { not: null } },
              { pending_dompis: { not: '' } },
              { status: { not: 'closed' } },
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
        where.workzone = { contains: selectedWorkzone };
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
          ? { workzone: { contains: selectedWorkzone } }
          : { id_ticket: 0 };
      }

      return {
        workzone: { in: workzones },
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

  static async buildDailyTicketWhere(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ): Promise<Record<string, any>> {
    const {
      search = '',
      statusUpdate,
      dept,
      ticketType,
      flagging,
      workzone,
      ctype,
    } = filters ?? {};

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
            { incident: { contains: search } },
            { contact_name: { contains: search } },
            { service_no: { contains: search } },
            { contact_phone: { contains: search } },
          ],
        },
      ];
    }

    if (statusUpdate) {
      applyStatusUpdateWhere(where, statusUpdate);
    }

    if (ctype) {
      where.customer_type = ctype;
    }

    applyTicketTypeWhere(where, ticketType);
    applyFlaggingWhere(where, flagging);

    if (dept && dept !== 'all') {
      const jenisClause = dept === 'b2c' ? getB2CJenisWhereClause() : getB2BJenisWhereClause();
      where.AND = [
        ...(where.AND ?? []),
        jenisClause,
      ];
    }

    return where;
  }

  /**
   * Optimized Status Counter
   *
   * Replaces 6 COUNT queries
   */

  static async countStatuses(where: Record<string, any>) {
    const grouped = await prisma.ticket.groupBy({
      by: ['status_update'],
      where,
      _count: {
        status_update: true,
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
      const count = g._count.status_update;

      stats.total += count;

      const status = (g.status_update ?? 'open').toLowerCase();

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
   * Fetches all matching tickets, sorts by priority (P1 > P+ > others),
   * then applies client-side pagination.
   */

  static async getDailyTicketTable(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const { page = 1, limit = 10 } = filters ?? {};

    const where = await this.buildDailyTicketWhere(role, userId, filters);

    // Get total count
    const total = await prisma.ticket.count({ where });

    // Fetch ALL matching tickets (Prisma handles WHERE safely)
    const allTickets = await prisma.ticket.findMany({
      where,
      include: {
        users: {
          select: { nama: true },
        },
      },
      orderBy: [{ reported_date: 'desc' }, { id_ticket: 'asc' }],
    });

    // Sort by priority: P1 > P+ > others
    const sorted = allTickets.sort((a, b) => {
      const priorityA = a.flagging_manja === 'P1' ? 1 : a.flagging_manja === 'P+' ? 2 : 3;
      const priorityB = b.flagging_manja === 'P1' ? 1 : b.flagging_manja === 'P+' ? 2 : 3;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return 0;
    });

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginated = sorted.slice(offset, offset + limit);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: paginated.map(mapTicket),
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
      const jenisClause = p0.dept === 'b2c' ? getB2CJenisWhereClause() : getB2BJenisWhereClause();
      where.AND = [
        ...(where.AND ?? []),
        jenisClause,
      ];
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
      serviceAreas.map(
        async (sa: { id_sa: number; nama_sa: string | null }) => {
          const where: Record<string, any> = {
            workzone: { contains: sa.nama_sa },
          };

          await this.applyDailyTicketFilter(where);

          if (options?.statusUpdate && options.statusUpdate !== 'all') {
            applyStatusUpdateWhere(where, options.statusUpdate);
          }

          if (options?.dept && options.dept !== 'all') {
            const { getJenisWhereClause } = await import('@/app/config/jenis-tiket');
            const jenisClause = getJenisWhereClause(options.dept);
            Object.assign(where, jenisClause);
          }

          if (options?.ticketType && options.ticketType !== 'all') {
            const { getJenisWhereClause } = await import('@/app/config/jenis-tiket');
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
        },
      ),
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
    descriptionSolutionDompis: string,
  ) {
    return TicketWorkflowService.closeTicket(
      ticketId,
      { id_user: teknisiUserId, role: 'teknisi' },
      rca,
      subRca,
      descriptionSolutionDompis,
    );
  }
}
