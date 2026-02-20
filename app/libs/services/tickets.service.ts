import prisma from '@/app/libs/prisma';
import {
  TicketWorkflowService,
  type ActorContext,
} from './ticketWorkflow.service';

export class TicketService {
  private static async buildWorkzoneFilterForAdmin(
    userId: number,
  ): Promise<string[]> {
    const userSas = await prisma.user_sa.findMany({
      where: { user_id: userId },
      include: { service_area: true },
    });
    return userSas
      .map((us) => us.service_area?.nama_sa)
      .filter((name): name is string => name !== null && name !== undefined);
  }

  static async getTickets(
    role: string,
    userId: number,
    filters?: {
      search?: string;
      hasilVisit?: string;
      workzone?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      search = '',
      hasilVisit,
      workzone,
      page = 1,
      limit = 20,
    } = filters || {};

    const offset = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (search) {
      where.OR = [
        { INCIDENT: { contains: search } },
        { CONTACT_NAME: { contains: search } },
        { SERVICE_NO: { contains: search } },
        { CONTACT_PHONE: { contains: search } },
      ];
    }

    if (hasilVisit) {
      where.HASIL_VISIT = hasilVisit;
    }

    const serviceAreaId = Number(workzone);
    const hasServiceAreaFilter =
      Number.isFinite(serviceAreaId) && serviceAreaId > 0;

    let selectedWorkzone: string | null = null;
    if (hasServiceAreaFilter) {
      const sa = await prisma.service_area.findUnique({
        where: { id_sa: serviceAreaId },
      });
      if (sa?.nama_sa) {
        selectedWorkzone = sa.nama_sa;
      }
    }

    if (role === 'teknisi') {
      where.teknisi_user_id = userId;
      if (selectedWorkzone) {
        where.WORKZONE = { contains: selectedWorkzone };
      }
    } else if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const workzones = await this.buildWorkzoneFilterForAdmin(userId);
      if (workzones.length > 0) {
        if (selectedWorkzone) {
          if (workzones.includes(selectedWorkzone)) {
            where.WORKZONE = { contains: selectedWorkzone };
          } else {
            where.id_ticket = 0;
          }
        } else {
          where.WORKZONE = {
            in: workzones,
          };
        }
      } else {
        where.id_ticket = 0;
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
        orderBy: [{ REPORTED_DATE: 'desc' }, { id_ticket: 'desc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const data = tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticket: t.INCIDENT,
      summary: t.SUMMARY,
      reportedDate: t.REPORTED_DATE,
      ownerGroup: t.OWNER_GROUP,
      serviceType: t.SERVICE_TYPE,
      customerType: t.CUSTOMER_TYPE,
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
      pendingReason: (t as any).PENDING_REASON,
      teknisiUserId: t.teknisi_user_id,
      rca: t.rca,
      subRca: t.sub_rca,
      alamat: t.ALAMAT,
      closedAt: t.closed_at,
      technicianName: t.users?.nama,
    }));

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  static async getUnassignedTickets(role: string, userId: number) {
    const where: Record<string, any> = {
      teknisi_user_id: null,
      HASIL_VISIT: 'OPEN',
    };

    if (role === 'teknisi') {
      where.teknisi_user_id = userId;
    } else if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const workzones = await this.buildWorkzoneFilterForAdmin(userId);
      if (workzones.length > 0) {
        where.WORKZONE = { in: workzones };
      } else {
        where.id_ticket = 0;
      }
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { REPORTED_DATE: 'desc' },
    });

    return tickets;
  }

  static async search(incident: string, role: string, userId: number) {
    const where: Record<string, any> = {
      INCIDENT: { contains: incident },
    };

    if (role === 'teknisi') {
      where.teknisi_user_id = userId;
    } else if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const workzones = await this.buildWorkzoneFilterForAdmin(userId);
      if (workzones.length > 0) {
        where.WORKZONE = { in: workzones };
      } else {
        where.id_ticket = 0;
      }
    }

    if (role === 'teknisi') {
      where.teknisi_user_id = userId;
    } else if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const workzones = await this.buildWorkzoneFilterForAdmin(userId);
      if (workzones.length > 0) {
        where.WORKZONE = { in: workzones };
      } else {
        where.id_ticket = 0;
      }
    }

    const tickets = await prisma.ticket.findMany({
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
    const where: Record<string, any> = {
      SERVICE_NO: { contains: serviceNo },
    };

    if (role === 'teknisi') {
      where.teknisi_user_id = userId;
    } else if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const workzones = await this.buildWorkzoneFilterForAdmin(userId);
      if (workzones.length > 0) {
        where.WORKZONE = { in: workzones };
      } else {
        where.id_ticket = 0;
      }
    }

    const tickets = await prisma.ticket.findMany({
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
    const userSas = await prisma.user_sa.findMany({
      where: { user_id: userId },
      include: { service_area: true },
    });

    const saNames = userSas
      .map((us) => us.service_area?.nama_sa)
      .filter((name): name is string => name !== null && name !== undefined);

    const tickets = await prisma.ticket.findMany({
      where: {
        WORKZONE: {
          in: saNames,
        },
      },
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
    const teknisi = await prisma.users.findMany({
      where: {
        roles: {
          key: 'teknisi',
        },
      },
      select: {
        id_user: true,
        nama: true,
        nik: true,
      },
      orderBy: { nama: 'asc' },
    });

    return teknisi;
  }

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
    const actor = { id_user: teknisiUserId, role: 'teknisi' };

    if (resume) {
      return TicketWorkflowService.updateTicket(ticketId, actor, {
        workflow: {
          status: 'ON_PROGRESS',
          note: 'Resume work',
        },
      });
    }

    const cleanDescription = String(description || '').trim();

    if (!cleanDescription) {
      throw new Error('Description is required');
    }

    return TicketWorkflowService.updateTicket(ticketId, actor, {
      workflow: {
        status: 'PENDING',
        pendingReason: cleanDescription,
        note: 'Progress update',
      },
    });
  }

  static async getStats(role: string, userId: number, saId?: number) {
    const where: Record<string, any> = {};

    const serviceAreaId = Number(saId);
    const hasSaFilter = Number.isFinite(serviceAreaId) && serviceAreaId > 0;

    let selectedWorkzone: string | null = null;
    if (hasSaFilter) {
      const sa = await prisma.service_area.findUnique({
        where: { id_sa: serviceAreaId },
      });
      if (sa?.nama_sa) {
        selectedWorkzone = sa.nama_sa;
      }
    }

    if (role === 'teknisi') {
      where.teknisi_user_id = userId;
      if (selectedWorkzone) {
        where.WORKZONE = { contains: selectedWorkzone };
      }
    } else if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const workzones = await this.buildWorkzoneFilterForAdmin(userId);
      if (workzones.length > 0) {
        if (selectedWorkzone) {
          if (workzones.includes(selectedWorkzone)) {
            where.WORKZONE = { contains: selectedWorkzone };
          } else {
            where.id_ticket = 0;
          }
        } else {
          where.WORKZONE = { in: workzones };
        }
      } else {
        where.id_ticket = 0;
      }
    }

    const [total, unassigned, openVal, assigned, closed] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, teknisi_user_id: null } }),
      prisma.ticket.count({ where: { ...where, HASIL_VISIT: 'OPEN' } }),
      prisma.ticket.count({ where: { ...where, HASIL_VISIT: 'ASSIGNED' } }),
      prisma.ticket.count({ where: { ...where, HASIL_VISIT: 'CLOSE' } }),
    ]);

    return {
      total,
      unassigned,
      open: openVal,
      assigned,
      closed,
    };
  }

  static async getStatsByServiceArea(
    role: string,
    userId: number,
    saId?: number,
  ) {
    let userSaIds: number[] = [];
    let userWorkzones: string[] = [];

    if (
      role === 'admin' ||
      role === 'helpdesk' ||
      role === 'superadmin' ||
      role === 'super_admin'
    ) {
      const userSas = await prisma.user_sa.findMany({
        where: { user_id: userId },
        select: { sa_id: true },
      });
      userSaIds = userSas
        .map((us) => us.sa_id)
        .filter((id): id is number => id !== null);

      userWorkzones = await this.buildWorkzoneFilterForAdmin(userId);
    }

    let serviceAreaFilter: any = undefined;

    if (saId && saId > 0) {
      serviceAreaFilter = { id_sa: Number(saId) };
    } else if (userSaIds.length > 0) {
      serviceAreaFilter = { id_sa: { in: userSaIds } };
    } else if (role !== 'teknisi') {
      return [];
    }

    const serviceAreas = await prisma.service_area.findMany({
      where: serviceAreaFilter,
    });

    const results = await Promise.all(
      serviceAreas.map(async (sa) => {
        const whereClause: Record<string, any> = {};

        if (role === 'teknisi') {
          whereClause.teknisi_user_id = userId;
          whereClause.WORKZONE = { contains: sa.nama_sa || '' };
        } else if (
          role === 'admin' ||
          role === 'helpdesk' ||
          role === 'superadmin' ||
          role === 'super_admin'
        ) {
          if (userWorkzones.length > 0) {
            if (userWorkzones.includes(sa.nama_sa || '')) {
              whereClause.WORKZONE = { contains: sa.nama_sa || '' };
            } else {
              whereClause.id_ticket = 0;
            }
          } else {
            whereClause.id_ticket = 0;
          }
        }

        const [total, unassigned, openVal, assigned, closed] =
          await Promise.all([
            prisma.ticket.count({ where: whereClause }),
            prisma.ticket.count({
              where: { ...whereClause, teknisi_user_id: null },
            }),
            prisma.ticket.count({
              where: { ...whereClause, HASIL_VISIT: 'OPEN' },
            }),
            prisma.ticket.count({
              where: { ...whereClause, HASIL_VISIT: 'ASSIGNED' },
            }),
            prisma.ticket.count({
              where: { ...whereClause, HASIL_VISIT: 'CLOSE' },
            }),
          ]);

        return {
          id_sa: sa.id_sa,
          nama_sa: sa.nama_sa,
          total,
          unassigned,
          open: openVal,
          assigned,
          closed,
        };
      }),
    );

    return results;
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
}
