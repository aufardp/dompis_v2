// app/services/ticket.service.ts

import prisma from '@/app/libs/prisma';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser, resolveWorkzoneName } from './ticket.helpers';
import {
  TicketWorkflowService,
  type ActorContext,
} from './ticketWorkflow.service';

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketFilters = {
  search?: string;
  hasilVisit?: string;
  workzone?: number | string;
  ctype?: string;
  page?: number;
  limit?: number;
};

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
    hasilVisit: t.HASIL_VISIT,
    bookingDate: t.BOOKING_DATE,
    symptom: t.SYMPTOM,
    descriptionActualSolution: t.DESCRIPTION_ACTUAL_SOLUTION,
    workzone: t.WORKZONE,
    customerSegment: t.CUSTOMER_SEGMENT,
    sourceTicket: t.SOURCE_TICKET,
    jenisTiket: t.JENIS_TIKET,
    maxTtrReguler: t.JAM_EXPIRED_24_JAM_REGULER,
    maxTtrGold: t.JAM_EXPIRED_12_JAM_GOLD,
    maxTtrPlatinum: t.JAM_EXPIRED_6_JAM_PLATINUM,
    maxTtrDiamond: t.JAM_EXPIRED_3_JAM_DIAMOND,
    pendingReason: t.PENDING_REASON,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.ALAMAT,
    closedAt: t.closed_at,
    technicianName: t.users?.nama,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class TicketService {
  // ── Private Helpers ──────────────────────────────────────────────────────────

  /**
   * Builds a Prisma `where` fragment that restricts results to tickets the
   * caller is allowed to see. Returns `{ id_ticket: 0 }` as a zero-result
   * sentinel whenever access should be denied.
   */
  private static async buildWorkzoneWhere(
    role: string,
    userId: number,
    selectedWorkzone?: string | null,
  ): Promise<Record<string, any>> {
    if (role === 'teknisi') {
      const where: Record<string, any> = { teknisi_user_id: userId };
      if (selectedWorkzone) where.WORKZONE = { contains: selectedWorkzone };
      return where;
    }

    if (isAdminRole(role)) {
      const workzones = await getWorkzonesForUser(userId);
      if (workzones.length === 0) return { id_ticket: 0 };

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

  /** Counts tickets across all statuses for a given `where` clause. */
  private static async countStatuses(where: Record<string, any>) {
    const [total, unassigned, open, assigned, closed] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, teknisi_user_id: null } }),
      prisma.ticket.count({ where: { ...where, HASIL_VISIT: 'OPEN' } }),
      prisma.ticket.count({ where: { ...where, HASIL_VISIT: 'ASSIGNED' } }),
      prisma.ticket.count({ where: { ...where, HASIL_VISIT: 'CLOSE' } }),
    ]);

    return { total, unassigned, open, assigned, closed };
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  static async getTickets(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const {
      search = '',
      hasilVisit,
      workzone,
      ctype,
      page = 1,
      limit = 20,
    } = filters ?? {};
    const offset = (page - 1) * limit;

    const selectedWorkzone = await this.resolveSelectedWorkzone(workzone);
    const where: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(role, userId, selectedWorkzone)),
    };

    if (search) {
      where.OR = [
        { INCIDENT: { contains: search } },
        { CONTACT_NAME: { contains: search } },
        { SERVICE_NO: { contains: search } },
        { CONTACT_PHONE: { contains: search } },
      ];
    }

    if (hasilVisit) where.HASIL_VISIT = hasilVisit;
    if (ctype) where.CUSTOMER_TYPE = ctype;

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: { users: { select: { nama: true } } },
        orderBy: [{ REPORTED_DATE: 'desc' }, { id_ticket: 'desc' }],
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
    const where = { ...roleWhere, teknisi_user_id: null, HASIL_VISIT: 'OPEN' };

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
      hasilVisit: t.HASIL_VISIT,
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
      hasilVisit: t.HASIL_VISIT,
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
      hasilVisit: t.HASIL_VISIT,
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
      hasilVisit: t.HASIL_VISIT,
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

  // ── Stats ─────────────────────────────────────────────────────────────────────

  static async getStats(role: string, userId: number, saId?: number) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);
    const where = await this.buildWorkzoneWhere(role, userId, selectedWorkzone);
    return this.countStatuses(where);
  }

  static async getStatsByServiceArea(
    role: string,
    userId: number,
    saId?: number,
  ) {
    if (!isAdminRole(role)) return [];

    const userSas = await prisma.user_sa.findMany({
      where: { user_id: userId },
      select: { sa_id: true },
    });

    const userSaIds = userSas
      .map((us) => us.sa_id)
      .filter((id): id is number => id !== null);

    if (userSaIds.length === 0) return [];

    const userWorkzones = await getWorkzonesForUser(userId);

    const serviceAreaFilter =
      saId && saId > 0 ? { id_sa: Number(saId) } : { id_sa: { in: userSaIds } };

    const serviceAreas = await prisma.service_area.findMany({
      where: serviceAreaFilter,
    });

    return Promise.all(
      serviceAreas.map(async (sa) => {
        const saName = sa.nama_sa ?? '';
        const where: Record<string, any> = userWorkzones.includes(saName)
          ? { WORKZONE: { contains: saName } }
          : { id_ticket: 0 };

        const counts = await this.countStatuses(where);
        return { id_sa: sa.id_sa, nama_sa: sa.nama_sa, ...counts };
      }),
    );
  }

  static async getStatsByCustomerType(
    role: string,
    userId: number,
    saId?: number,
  ) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);
    const baseWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      selectedWorkzone,
    );

    const customerTypes = [
      'REGULER',
      'HVC_GOLD',
      'HVC_PLATINUM',
      'HVC_DIAMOND',
    ];

    return Promise.all(
      customerTypes.map(async (ctype) => {
        const where = { ...baseWhere, CUSTOMER_TYPE: ctype };
        const counts = await this.countStatuses(where);
        return { ctype, ...counts };
      }),
    );
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

  static async getExpiredTickets(role: string, userId: number, saId?: number) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);
    const baseWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      selectedWorkzone,
    );

    const tickets = await prisma.ticket.findMany({
      where: {
        ...baseWhere,
        HASIL_VISIT: { not: 'CLOSE' },
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
      status: t.HASIL_VISIT,
      technicianName: t.users?.nama,
    }));
  }
}
