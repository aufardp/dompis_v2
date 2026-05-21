// app/services/ticket.service.ts

import prisma from '@/app/libs/prisma';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';
import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';
import { AttendanceService } from './attendance.service';
import { CUSTOMER_TYPES, getSlaHours } from '@/app/config/customer-types';
import { toWibString, toWibDateString, getTodayWibRange } from '@/lib/timezone';
import { resolveEffectiveFlagging } from '../flagging-manja';

// ── Types ─────────────────────────────────────────────────────────────────────

import { getJenisWhereClause } from '@/app/config/jenis-tiket';

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
      where.OR = [{ status_update: null }, { status_update: 'open' }];
      break;

    case 'assigned':
      where.status_update = 'assigned';
      break;

    case 'on_progress':
      where.status_update = 'on_progress';
      break;

    case 'pending':
      where.status_update = 'pending';
      break;

    case 'close':
      where.status_update = 'close';
      break;

    default:
      // Fallback: try direct match
      where.status_update = su;
      break;
  }
}

// ── Mapper ────────────────────────────────────────────────────────────────────

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
    ticketIdGamas: t.ticket_id_gamas ?? null,
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
    descriptionSolutionDompis: t.description_solution_dompis,
    workzone: t.workzone,
    customerSegment: t.customer_segment,
    sourceTicket: t.source_ticket,
    jenisTiket: t.jenis_tiket_2,
    flaggingManja: resolveEffectiveFlagging(t.flagging_manja, t.booking_date),
    guaranteeStatus: t.guarantee_status,
    maxTtrReguler: null,
    maxTtrGold: null,
    maxTtrPlatinum: null,
    maxTtrDiamond: null,
    pendingDompis: t.pending_dompis,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.alamat,
    closedAt: toWibString(t.closed_at),
    syncedAt: toWibString(t.synced_at),
    technicianName: t.users?.nama,
    worklogSummary: t.worklog_summary,
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
      const B2C_CTYPES = CUSTOMER_TYPES.map((ct) => ct.key);

      if (dept === 'b2c') {
        where.customer_type = { in: B2C_CTYPES };
      } else if (dept === 'b2b') {
        where.OR = [
          { customer_type: { notIn: B2C_CTYPES } },
          { customer_type: null },
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
      // ============================================================
      // DAILY-BASED FILTER LOGIC
      //Requirement:
      // - assigned → HARI INI saja (wajib hilang jika berganti hari)
      // - on_progress → HARI INI saja (wajib hilang jika berganti hari)
      // - pending → SEMUA (tetap muncul meski sudah berganti hari)
      // - close → SEMUA history (tetap muncul semua)
      // ============================================================

      // Get today's date range in WIB timezone
      const now = new Date();
      const wibNow = toZonedTime(now, 'Asia/Jakarta');
      const todayStart = startOfDay(wibNow);
      const todayEnd = endOfDay(wibNow);

      // Get ticket IDs that were assigned ON TODAY (using ticket_assignment_history)
      const todayAssignments = await prisma.ticket_assignment_history.findMany({
        where: {
          assigned_to: userId,
          assigned_at: {
            gte: todayStart,
            lte: todayEnd,
          },
          is_active: true,
        },
        select: { ticket_id: true },
      });
      const todayTicketIds = todayAssignments.map((a) => a.ticket_id);

      const where: Record<string, any> = {
        teknisi_user_id: userId,
        OR: [
          // assigned & on_progress: HANYA yang di-assign hari ini (berdasarkan assignment history)
          {
            AND: [
              { status_update: { in: ['assigned', 'on_progress'] } },
              {
                id_ticket:
                  todayTicketIds.length > 0
                    ? { in: todayTicketIds }
                    : { equals: -1 }, // No tickets if empty
              },
            ],
          },
          // pending: SEMUA (tidak dibatasi tanggal)
          { status_update: 'pending' },
          // close: SEMUA history
          { status_update: 'close' },
        ],
      };

      if (selectedWorkzone) {
        where.workzone = { contains: selectedWorkzone };
      }

      console.log('[buildWorkzoneWhere] Teknisi filter:', where);
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
          ? { workzone: { contains: selectedWorkzone } }
          : { id_ticket: 0 };
      }

      return { workzone: { in: workzones } };
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
        { incident: { contains: search } },
        { contact_name: { contains: search } },
        { service_no: { contains: search } },
        { contact_phone: { contains: search } },
      ];
    }

    /* DATE FILTER */
    if (startDate || endDate) {
      if (startDate && endDate) {
        andClauses.push({
          reported_date: {
            gte: startDate,
            lte: endDate + ' 23:59:59',
          },
        });
      } else if (startDate) {
        andClauses.push({
          reported_date: { gte: startDate },
        });
      } else if (endDate) {
        andClauses.push({
          reported_date: { lte: endDate + ' 23:59:59' },
        });
      }
    }

    /* status */
    if (statusUpdate) applyStatusUpdateWhere(where, statusUpdate);

    /* CUSTOMER TYPE */
    if (ctype) where.customer_type = ctype;

    /* JENIS TIKET */
    if (ticketType && ticketType !== 'all') {
      andClauses.push(getJenisWhereClause(ticketType));
    }

    /* DEPT FILTER */
    if (dept && dept !== 'all') {
      const B2C_CTYPES = CUSTOMER_TYPES.map((ct) => ct.key);

      if (dept === 'b2c') {
        andClauses.push({
          customer_type: { in: B2C_CTYPES },
        });
      }

      if (dept === 'b2b') {
        andClauses.push({
          customer_type: { notIn: B2C_CTYPES },
        });
        andClauses.push({
          customer_segment: { notIn: ['PL-TSEL', 'DCS'] },
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
          incident: true,
          summary: true,
          reported_date: true,
          owner_group: true,
          service_type: true,
          service_no: true,
          contact_name: true,
          contact_phone: true,
          booking_date: true,
          workzone: true,
          customer_type: true,
          customer_segment: true,
          jenis_tiket_2: true,
          flagging_manja: true,
          guarantee_status: true,
          status_update: true,
          status: true,
          worklog_summary: true,
          symptom: true,
          alamat: true,
          device_name: true,
          pending_dompis: true,
          source_ticket: true,
          description_solution_dompis: true,
          rca: true,
          sub_rca: true,
          closed_at: true,
          teknisi_user_id: true,
          ticket_id_gamas: true,
          users: {
            select: {
              nama: true,
            },
          },
        },

        orderBy: [{ reported_date: sort }, { id_ticket: 'asc' }],

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
      OR: [{ status_update: null }, { status_update: { not: 'close' } }],
    };

    return prisma.ticket.findMany({
      where,
      orderBy: { reported_date: 'desc' },
    });
  }

  static async search(incident: string, role: string, userId: number) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = { ...roleWhere, incident: { contains: incident } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
    });

    return tickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      contactName: t.contact_name,
      contactPhone: t.contact_phone,
      serviceNo: t.service_no,
      workzone: t.workzone,
      hasilVisit: t.status_update,
    }));
  }

  static async searchByContactName(
    contactName: string,
    role: string,
    userId: number,
  ) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = { ...roleWhere, contact_name: { contains: contactName } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
    });

    return tickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      contactName: t.contact_name,
      contactPhone: t.contact_phone,
      serviceNo: t.service_no,
      workzone: t.workzone,
      hasilVisit: t.status_update,
    }));
  }

  static async searchByServiceNo(
    serviceNo: string,
    role: string,
    userId: number,
  ) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = { ...roleWhere, service_no: { contains: serviceNo } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
    });

    return tickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      serviceNo: t.service_no,
      contactName: t.contact_name,
      contactPhone: t.contact_phone,
      workzone: t.workzone,
      hasilVisit: t.status_update,
    }));
  }

  static async getTicketsByUser(userId: number) {
    const saNames = await getWorkzonesForUser(userId);

    const tickets = await prisma.ticket.findMany({
      where: { workzone: { in: saNames } },
      orderBy: [{ reported_date: 'desc' }, { id_ticket: 'desc' }],
      take: 200,
    });

    return tickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      summary: t.summary,
      reportedDate: t.reported_date,
      workzone: t.workzone,
      hasilVisit: t.status_update,
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
      select: { customer_type: true },
      distinct: ['customer_type'],
      where: { customer_type: { not: null } },
      orderBy: { customer_type: 'asc' },
    });

    return tickets.map((t: any) => ({ customerType: t.customer_type }));
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
        pendingDompis: cleanDescription,
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
        OR: [{ status_update: null }, { status_update: { not: 'close' } }],
      },
      include: { users: { select: { nama: true } } },
      orderBy: { reported_date: 'asc' },
    });

    const now = new Date();
    const expiredTickets = tickets.filter((ticket: any) => {
      if (!ticket.reported_date) return false;
      const slaHours = getSlaHours(ticket.customer_type);
      const reportedDate = new Date(ticket.reported_date);
      const hoursElapsed =
        (now.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);
      return hoursElapsed > slaHours;
    });

    return expiredTickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      customerType: t.customer_type,
      reportedDate: t.reported_date,
      status: t.status_update,
      technicianName: t.users?.nama,
      teknisiUserId: t.teknisi_user_id,
      workzone: t.workzone,
      contactName: t.contact_name,
      serviceNo: t.service_no,
    }));
  }
}
