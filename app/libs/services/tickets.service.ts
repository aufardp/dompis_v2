// app/services/ticket.service.ts

import prisma from '@/app/libs/prisma';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';
import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';

// ── Types ─────────────────────────────────────────────────────────────────────

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

function applyStatusUpdateWhere(
  where: Record<string, any>,
  statusUpdate?: string,
) {
  const su = normalizeStatusUpdateFilter(statusUpdate);
  if (!su || su === 'all') return;

  switch (su) {
    case 'open':
      where.OR = [{ STATUS_UPDATE: null }, { STATUS_UPDATE: 'open' }];
      break;

    case 'assigned':
      where.STATUS_UPDATE = 'assigned';
      break;

    case 'on_progress':
      where.STATUS_UPDATE = 'on_progress';
      break;

    case 'pending':
      where.STATUS_UPDATE = 'pending';
      break;

    case 'close':
      where.STATUS_UPDATE = 'close';
      break;

    default:
      // Fallback: try direct match
      where.STATUS_UPDATE = su;
      break;
  }
}

// ── Mapper ────────────────────────────────────────────────────────────────────

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
    maxTtrReguler: t.JAM_EXPIRED_24_JAM_REGULER,
    maxTtrGold: t.JAM_EXPIRED_12_JAM_GOLD,
    maxTtrPlatinum: t.JAM_EXPIRED_6_JAM_PLATINUM,
    maxTtrDiamond: t.JAM_EXPIRED_3_JAM_DIAMOND,
    pendingReason: t.PENDING_REASON,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.ALAMAT,
    closedAt: t.closed_at ? t.closed_at.toISOString() : null,
    technicianName: t.users?.nama,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class TicketService {
  // ── Private Helpers ──────────────────────────────────────────────────────────

  private static applyDashboardFilters(
    where: Record<string, any>,
    opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
  ) {
    const dept = opts?.dept;
    const ticketType = opts?.ticketType;
    const statusUpdate = opts?.statusUpdate;

    if (statusUpdate && statusUpdate !== 'all') {
      applyStatusUpdateWhere(where, statusUpdate);
    }

    if (ticketType && ticketType !== 'all') {
      const jenisClause = getJenisWhereClause(ticketType);
      Object.assign(where, jenisClause);
    }

    if (dept && dept !== 'all') {
      const B2C_CTYPES = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND'];

      if (dept === 'b2c') {
        where.CUSTOMER_TYPE = { in: B2C_CTYPES };
      } else if (dept === 'b2b') {
        where.OR = [
          { CUSTOMER_TYPE: { notIn: B2C_CTYPES } },
          { CUSTOMER_TYPE: null },
        ];
      }
    }
  }

  private static async buildWorkzoneWhere(
    role: string,
    userId: number,
    selectedWorkzone?: string | null,
  ): Promise<Record<string, any>> {
    console.log('[buildWorkzoneWhere]', { role, userId, selectedWorkzone });

    if (role === 'teknisi') {
      const where: Record<string, any> = { teknisi_user_id: userId };
      if (selectedWorkzone) where.WORKZONE = { contains: selectedWorkzone };
      return where;
    }

    if (isAdminRole(role)) {
      const workzones = await getWorkzonesForUser(userId);
      console.log('[buildWorkzoneWhere] Admin workzones:', workzones);

      // If admin has no workzones, return empty filter (show all tickets)
      if (workzones.length === 0) {
        console.log(
          '[buildWorkzoneWhere] No workzones assigned, showing all tickets',
        );
        return {};
      }

      if (selectedWorkzone) {
        return workzones.includes(selectedWorkzone)
          ? { WORKZONE: { contains: selectedWorkzone } }
          : { id_ticket: 0 };
      }

      return { WORKZONE: { in: workzones } };
    }

    return {};
  }

  /** Resolves a service-area ID to its workzone name, or null when invalid. */
  private static async resolveSelectedWorkzone(
    saId?: number | string,
  ): Promise<string | null> {
    const id = Number(saId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return resolveWorkzoneName(id);
  }

  // ── Read ─────────────────────────────────────────────────────────────────────
  static async getTickets(
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
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = 'asc',
    } = filters ?? {};

    const offset = (page - 1) * limit;

    const selectedWorkzone = await this.resolveSelectedWorkzone(workzone);

    const where: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(role, userId, selectedWorkzone)),
    };

    const andClauses: Record<string, any>[] = [];

    /* SEARCH */
    if (search) {
      where.OR = [
        { INCIDENT: { contains: search } },
        { CONTACT_NAME: { contains: search } },
        { SERVICE_NO: { contains: search } },
        { CONTACT_PHONE: { contains: search } },
      ];
    }

    /* DATE FILTER */
    if (startDate || endDate) {
      if (startDate && endDate) {
        andClauses.push({
          REPORTED_DATE: {
            gte: startDate,
            lte: endDate + ' 23:59:59',
          },
        });
      } else if (startDate) {
        andClauses.push({
          REPORTED_DATE: { gte: startDate },
        });
      } else if (endDate) {
        andClauses.push({
          REPORTED_DATE: { lte: endDate + ' 23:59:59' },
        });
      }
    }

    /* STATUS */
    if (statusUpdate) applyStatusUpdateWhere(where, statusUpdate);

    /* CUSTOMER TYPE */
    if (ctype) where.CUSTOMER_TYPE = ctype;

    /* JENIS TIKET */
    if (ticketType && ticketType !== 'all') {
      andClauses.push(getJenisWhereClause(ticketType));
    }

    /* DEPT FILTER */
    if (dept && dept !== 'all') {
      const B2C_CTYPES = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND'];

      if (dept === 'b2c') {
        andClauses.push({
          CUSTOMER_TYPE: { in: B2C_CTYPES },
        });
      }

      if (dept === 'b2b') {
        andClauses.push({
          CUSTOMER_TYPE: { notIn: B2C_CTYPES },
        });
      }
    }

    if (andClauses.length > 0) {
      where.AND = [...(where.AND ?? []), ...andClauses];
    }

    /* QUERY DATABASE */

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),

      prisma.ticket.findMany({
        where,

        select: {
          id_ticket: true,
          INCIDENT: true,
          SUMMARY: true,
          REPORTED_DATE: true,
          OWNER_GROUP: true,
          SERVICE_TYPE: true,
          SERVICE_NO: true,
          CONTACT_NAME: true,
          CONTACT_PHONE: true,
          BOOKING_DATE: true,
          WORKZONE: true,
          CUSTOMER_TYPE: true,
          CUSTOMER_SEGMENT: true,
          JENIS_TIKET: true,
          FLAGGING_MANJA: true,
          GUARANTE_STATUS: true,
          STATUS_UPDATE: true,
          SYMPTOM: true,
          ALAMAT: true,
          DEVICE_NAME: true,
          PENDING_REASON: true,
          SOURCE_TICKET: true,
          DESCRIPTION_ACTUAL_SOLUTION: true,
          JAM_EXPIRED_24_JAM_REGULER: true,
          JAM_EXPIRED_12_JAM_GOLD: true,
          JAM_EXPIRED_6_JAM_PLATINUM: true,
          JAM_EXPIRED_3_JAM_DIAMOND: true,
          rca: true,
          sub_rca: true,
          closed_at: true,
          teknisi_user_id: true,
          users: {
            select: {
              nama: true,
            },
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

  static async getUnassignedTickets(role: string, userId: number) {
    // Only admin roles can see unassigned tickets
    if (!isAdminRole(role)) return [];

    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = {
      ...roleWhere,
      teknisi_user_id: null,
      OR: [{ STATUS_UPDATE: null }, { STATUS_UPDATE: { not: 'close' } }],
    };

    return prisma.ticket.findMany({
      where,
      orderBy: { REPORTED_DATE: 'desc' },
    });
  }

  static async search(incident: string, role: string, userId: number) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = { ...roleWhere, INCIDENT: { contains: incident } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticket: t.INCIDENT,
      contactName: t.CONTACT_NAME,
      contactPhone: t.CONTACT_PHONE,
      serviceNo: t.SERVICE_NO,
      workzone: t.WORKZONE,
      hasilVisit: t.STATUS_UPDATE,
    }));
  }

  static async searchByContactName(
    contactName: string,
    role: string,
    userId: number,
  ) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = { ...roleWhere, CONTACT_NAME: { contains: contactName } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticket: t.INCIDENT,
      contactName: t.CONTACT_NAME,
      contactPhone: t.CONTACT_PHONE,
      serviceNo: t.SERVICE_NO,
      workzone: t.WORKZONE,
      hasilVisit: t.STATUS_UPDATE,
    }));
  }

  static async searchByServiceNo(
    serviceNo: string,
    role: string,
    userId: number,
  ) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = { ...roleWhere, SERVICE_NO: { contains: serviceNo } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticket: t.INCIDENT,
      serviceNo: t.SERVICE_NO,
      contactName: t.CONTACT_NAME,
      contactPhone: t.CONTACT_PHONE,
      workzone: t.WORKZONE,
      hasilVisit: t.STATUS_UPDATE,
    }));
  }

  static async getTicketsByUser(userId: number) {
    const saNames = await getWorkzonesForUser(userId);

    const tickets = await prisma.ticket.findMany({
      where: { WORKZONE: { in: saNames } },
      orderBy: [{ REPORTED_DATE: 'desc' }, { id_ticket: 'desc' }],
      take: 200,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticket: t.INCIDENT,
      summary: t.SUMMARY,
      reportedDate: t.REPORTED_DATE,
      workzone: t.WORKZONE,
      hasilVisit: t.STATUS_UPDATE,
      teknisiUserId: t.teknisi_user_id,
    }));
  }

  static async getTeknisiUsers() {
    return prisma.users.findMany({
      where: { roles: { key: 'teknisi' } },
      select: { id_user: true, nama: true, nik: true },
      orderBy: { nama: 'asc' },
    });
  }

  static async getCustomerType() {
    const tickets = await prisma.ticket.findMany({
      select: { CUSTOMER_TYPE: true },
      distinct: ['CUSTOMER_TYPE'],
      where: { CUSTOMER_TYPE: { not: null } },
      orderBy: { CUSTOMER_TYPE: 'asc' },
    });

    return tickets.map((t) => ({ customerType: t.CUSTOMER_TYPE }));
  }

  // ── Workflow Delegation ───────────────────────────────────────────────────────

  static async assignToUser(
    ticketId: number,
    teknisiUserId: number,
    actor: ActorContext,
  ) {
    return TicketWorkflowService.assignToUser(ticketId, teknisiUserId, actor);
  }

  static async unassign(ticketId: number, role?: string, userId?: number) {
    if (!role || !userId) throw new Error('Unauthorized');
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

  static async update(
    ticketId: number,
    teknisiUserId: number,
    description?: string,
    resume?: boolean,
  ) {
    const actor: ActorContext = { id_user: teknisiUserId, role: 'teknisi' };

    if (resume) {
      return TicketWorkflowService.updateTicket(ticketId, actor, {
        workflow: { status: 'ON_PROGRESS', note: 'Resume work' },
      });
    }

    const cleanDescription = String(description ?? '').trim();
    if (!cleanDescription) throw new Error('Description is required');

    return TicketWorkflowService.updateTicket(ticketId, actor, {
      workflow: {
        status: 'PENDING',
        pendingReason: cleanDescription,
        note: 'Progress update',
      },
    });
  }

  // ── Expired Tickets ─────────────────────────────────────────────────────

  static async getExpiredTickets(
    role: string,
    userId: number,
    saId?: number,
    opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
  ) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);
    const baseWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      selectedWorkzone,
    );

    this.applyDashboardFilters(baseWhere, opts);

    const tickets = await prisma.ticket.findMany({
      where: {
        ...baseWhere,
        OR: [{ STATUS_UPDATE: null }, { STATUS_UPDATE: { not: 'close' } }],
      },
      include: { users: { select: { nama: true } } },
      orderBy: { REPORTED_DATE: 'asc' },
    });

    const SLA_HOURS: Record<string, number> = {
      REGULER: 24,
      HVC_GOLD: 12,
      HVC_PLATINUM: 6,
      HVC_DIAMOND: 3,
    };

    const now = new Date();
    const expiredTickets = tickets.filter((ticket) => {
      if (!ticket.REPORTED_DATE) return false;
      const slaHours = SLA_HOURS[ticket.CUSTOMER_TYPE || ''] || 24;
      const reportedDate = new Date(ticket.REPORTED_DATE);
      const hoursElapsed =
        (now.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);
      return hoursElapsed > slaHours;
    });

    return expiredTickets.map((t) => ({
      idTicket: t.id_ticket,
      ticket: t.INCIDENT,
      customerType: t.CUSTOMER_TYPE,
      reportedDate: t.REPORTED_DATE,
      status: t.STATUS_UPDATE,
      technicianName: t.users?.nama,
      teknisiUserId: t.teknisi_user_id,
      workzone: t.WORKZONE,
      contactName: t.CONTACT_NAME,
      serviceNo: t.SERVICE_NO,
    }));
  }
}
