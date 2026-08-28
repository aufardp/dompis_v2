import prisma from '@/app/libs/prisma';
import { todayWibDateForDb } from '@/lib/timezone';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { getJenisWhereClause } from '@/app/config/jenis-tiket';
import { buildOperationalBucketWhere } from '@/app/libs/services/ticket-buckets';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

export type AlertDiamondTicket = {
  idTicket: number;
  ticketId: string;
  incident: string;
  customerType: string;
  status: string;
  reportedAt: Date;
  workzone: string | null;
  contactName: string | null;
  serviceNo: string | null;
  technicianName: string | null;
  teknisiUserId: number | null;
  syncDate: string;
};

export class AlertTicketService {
  /**
   * Inbox B2B — subset Customer bucket untuk jenis_tiket_2 B2B:
   *  - K-Tier K1/K2 family (DATIN/ASTINET/VPN IP/METRO-E/IP_TRANSIT dengan suffix K1/K2, jenis_tiket_1='DATIN')
   *  - TSEL PREMIUM SITE, TSEL CRITICAL, TOP OLO
   *  Wajib: bucket kpi_customer AND status OPEN AND sync_date hari ini (WIB)
   */
  static async getInboxB2BTickets(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
    options?: { limit?: number },
  ): Promise<AlertDiamondTicket[]> {
    const limit = options?.limit ?? 8;
    const todayWib = todayWibDateForDb();
    const workzoneWhere = await this.buildWorkzoneWhere(role, userId, forcedWorkzoneId);
    const bucketWhere = buildOperationalBucketWhere('kpi_customer');

    const b2bOr: Record<string, any>[] = [
      { AND: [{ jenis_tiket_1: 'DATIN' }, { jenis_tiket_2: { endsWith: 'K1' } }] },
      { AND: [{ jenis_tiket_1: 'DATIN' }, { jenis_tiket_2: { endsWith: 'K2' } }] },
      getJenisWhereClause('tsel-premium-site'),
      getJenisWhereClause('tsel-critical'),
      getJenisWhereClause('top-olo'),
    ];

    const where: Record<string, any> = {
      sync_date: todayWib,
      status: 'OPEN',
      AND: [{ ...bucketWhere }, { OR: b2bOr }],
      ...workzoneWhere,
    };

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id_ticket: true,
        incident: true,
        summary: true,
        reported_date: true,
        customer_type: true,
        service_no: true,
        contact_name: true,
        status: true,
        status_update: true,
        workzone: true,
        sync_date: true,
        jenis_tiket_1: true,
        jenis_tiket_2: true,
        teknisi_user_id: true,
        users: { select: { nama: true } },
      },
      orderBy: { reported_date: 'desc' },
      take: limit,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticketId: t.incident,
      incident: t.incident,
      customerType: t.customer_type ?? '',
      status: t.status ?? 'open',
      reportedAt: t.reported_date ? new Date(t.reported_date) : new Date(),
      workzone: t.workzone,
      contactName: t.contact_name,
      serviceNo: t.service_no,
      technicianName: t.users?.nama ?? null,
      teknisiUserId: t.teknisi_user_id,
      syncDate: t.sync_date ? t.sync_date.toISOString() : '',
    }));
  }

  /**
   * Inbox B2C — DIAMOND + PLATINUM di dalam bucket Customer, OPEN hari ini
   * Wajib: bucket kpi_customer AND customer_type IN (DIAMOND, PLATINUM) AND sync_date hari ini
   */
  static async getInboxB2CTickets(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
    options?: { limit?: number },
  ): Promise<AlertDiamondTicket[]> {
    const limit = options?.limit ?? 8;
    const todayWib = todayWibDateForDb();
    const workzoneWhere = await this.buildWorkzoneWhere(role, userId, forcedWorkzoneId);
    const bucketWhere = buildOperationalBucketWhere('kpi_customer');

    const where: Record<string, any> = {
      sync_date: todayWib,
      customer_type: { in: ['HVC_DIAMOND', 'HVC_PLATINUM'] },
      status: 'OPEN',
      AND: [{ ...bucketWhere }, { status_update: { notIn: ['close', 'closed'] } }],
      ...workzoneWhere,
    };

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id_ticket: true,
        incident: true,
        summary: true,
        reported_date: true,
        customer_type: true,
        service_no: true,
        contact_name: true,
        status: true,
        status_update: true,
        workzone: true,
        sync_date: true,
        teknisi_user_id: true,
        users: { select: { nama: true } },
      },
      orderBy: { reported_date: 'desc' },
      take: limit,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticketId: t.incident,
      incident: t.incident,
      customerType: t.customer_type ?? 'HVC_DIAMOND',
      status: t.status ?? 'open',
      reportedAt: t.reported_date ? new Date(t.reported_date) : new Date(),
      workzone: t.workzone,
      contactName: t.contact_name,
      serviceNo: t.service_no,
      technicianName: t.users?.nama ?? null,
      teknisiUserId: t.teknisi_user_id,
      syncDate: t.sync_date ? t.sync_date.toISOString() : '',
    }));
  }

  /**
   * Get Diamond tickets that were synced TODAY only (WIB timezone)
   * This ensures the alert banner only shows tickets from today's sync,
   * not all historical Diamond tickets.
   *
   * @param role - User role for workzone filtering
   * @param userId - User ID for workzone filtering
   * @param forcedWorkzoneId - Override workzone (e.g., from URL param, admin-only)
   */
  static async getAlertDiamondTickets(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
    options?: {
      limit?: number;
      includeAssigned?: boolean;
      dept?: string;
      ticketType?: string;
    },
  ): Promise<AlertDiamondTicket[]> {
    const {
      limit = 500,
      includeAssigned = true,
      dept,
      ticketType,
    } = options ?? {};

    if (dept === 'b2b') {
      return [];
    }

    // Get today's date in WIB for sync_date filter
    const todayWib = todayWibDateForDb();

    // Build status filter
    const statusFilter = includeAssigned
      ? { notIn: ['close', 'closed'] }
      : { in: ['open', 'assigned', 'on_progress', 'pending'] };

    // Build workzone filter
    const workzoneWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      forcedWorkzoneId,
    );

    const bucketWhere = buildOperationalBucketWhere('kpi_customer');
    const where: Record<string, any> = {
      // Only today's sync (WIB date)
      sync_date: todayWib,
      // Only Diamond tickets — Customer bucket only (wajib bucket)
      customer_type: 'HVC_DIAMOND',
      AND: [
        bucketWhere,
        {
          OR: [
            { status: { notIn: CLOSE_STATUS_VALUES } },
            { status: null },
          ],
        },
        { status_update: statusFilter },
      ],
      ...workzoneWhere,
    };

    if (ticketType && ticketType !== 'all') {
      Object.assign(where, getJenisWhereClause(ticketType));
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id_ticket: true,
        incident: true,
        summary: true,
        reported_date: true,
        customer_type: true,
        service_no: true,
        contact_name: true,
        status_update: true,
        workzone: true,
        sync_date: true,
        teknisi_user_id: true,
        users: {
          select: { nama: true },
        },
      },
      orderBy: { reported_date: 'asc' },
      take: limit,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticketId: t.incident,
      incident: t.incident,
      customerType: t.customer_type ?? 'HVC_DIAMOND',
      status: t.status_update ?? 'open',
      reportedAt: t.reported_date ? new Date(t.reported_date) : new Date(),
      workzone: t.workzone,
      contactName: t.contact_name,
      serviceNo: t.service_no,
      technicianName: t.users?.nama ?? null,
      teknisiUserId: t.teknisi_user_id,
      syncDate: t.sync_date ? t.sync_date.toISOString() : '',
    }));
  }

  /**
   * Get count of Diamond+Platinum (Inbox B2C) tickets synced TODAY — wajib bucket Customer
   */
  static async getInboxB2CCount(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
  ): Promise<number> {
    const todayWib = todayWibDateForDb();
    const workzoneWhere = await this.buildWorkzoneWhere(role, userId, forcedWorkzoneId);
    const bucketWhere = buildOperationalBucketWhere('kpi_customer');
    const where: Record<string, any> = {
      sync_date: todayWib,
      customer_type: { in: ['HVC_DIAMOND', 'HVC_PLATINUM'] },
      status: 'OPEN',
      AND: [bucketWhere, { status_update: { notIn: ['close', 'closed'] } }],
      ...workzoneWhere,
    };
    return prisma.ticket.count({ where });
  }

  /**
   * Get count of Diamond tickets synced TODAY
   */
  static async getAlertDiamondCount(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
    options?: {
      dept?: string;
      ticketType?: string;
    },
  ): Promise<number> {
    if (options?.dept === 'b2b') {
      return 0;
    }

    const todayWib = todayWibDateForDb();

    const workzoneWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      forcedWorkzoneId,
    );

    const bucketWhere = buildOperationalBucketWhere('kpi_customer');
    const where: Record<string, any> = {
      sync_date: todayWib,
      customer_type: 'HVC_DIAMOND',
      AND: [
        bucketWhere,
        {
          OR: [
            { status: { notIn: CLOSE_STATUS_VALUES } },
            { status: null },
          ],
        },
        { status_update: { notIn: ['close', 'closed'] } },
      ],
      ...workzoneWhere,
    };

    if (options?.ticketType && options.ticketType !== 'all') {
      Object.assign(where, getJenisWhereClause(options.ticketType));
    }

    return prisma.ticket.count({ where });
  }

  /**
   * Build workzone WHERE clause based on user role
   * - Admin: filter by user's assigned workzones
   * - Teknisi: filter by user's workzone + teknisi_user_id
   * - Forced workzone (admin selector): override
   */
  private static async buildWorkzoneWhere(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
  ): Promise<Record<string, any>> {
    if (role === 'superadmin' || role === 'super_admin') {
      if (forcedWorkzoneId) {
        return { workzone: forcedWorkzoneId };
      }

      return {};
    }

    // Check teknisi FIRST (before isAdminRole narrows the type)
    if (role === 'teknisi') {
      return {
        AND: [
          { workzone: { not: null } },
          { teknisi_user_id: userId },
        ],
      };
    }

    // Admin forced selector — only admins can override
    if (forcedWorkzoneId && isAdminRole(role)) {
      return { workzone: forcedWorkzoneId };
    }

    // Admin/other roles — filter by user's assigned workzones
    if (isAdminRole(role)) {
      const workzones = await getWorkzonesForUser(userId);
      if (workzones.length === 0) {
        return { id_ticket: 0 };
      }
      return { workzone: { in: workzones } };
    }

    return {};
  }
}
