import prisma from '@/app/libs/prisma';
import { todayWIB } from '@/lib/google-sheets/helpers';
import { formatInTimeZone } from 'date-fns-tz';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

const WIB = 'Asia/Jakarta';

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
    },
  ): Promise<AlertDiamondTicket[]> {
    const { limit = 50, includeAssigned = true } = options ?? {};

    console.log(
      `[AlertDiamond] getAlertDiamondTickets — role: ${role}, userId: ${userId}, forcedWorkzone: ${forcedWorkzoneId}`,
    );

    // Get today's date in WIB as Date range (UTC midnight to next midnight)
    const todayWibStr = todayWIB();
    const startOfDayUTC = formatInTimeZone(
      new Date(`${todayWibStr}T00:00:00`),
      WIB,
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    );
    const endOfDayUTC = formatInTimeZone(
      new Date(`${todayWibStr}T23:59:59.999`),
      WIB,
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    );

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

    const where: Record<string, any> = {
      // Only today's sync
      sync_date: {
        gte: new Date(startOfDayUTC),
        lt: new Date(endOfDayUTC),
      },
      // Only Diamond tickets
      CUSTOMER_TYPE: 'HVC_DIAMOND',
      // Exclude closed tickets
      STATUS_UPDATE: statusFilter,
      ...workzoneWhere,
    };

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id_ticket: true,
        INCIDENT: true,
        SUMMARY: true,
        REPORTED_DATE: true,
        CUSTOMER_TYPE: true,
        SERVICE_NO: true,
        CONTACT_NAME: true,
        STATUS_UPDATE: true,
        WORKZONE: true,
        sync_date: true,
        teknisi_user_id: true,
        users: {
          select: { nama: true },
        },
      },
      orderBy: { REPORTED_DATE: 'asc' },
      take: limit,
    });

    return tickets.map((t) => ({
      idTicket: t.id_ticket,
      ticketId: t.INCIDENT,
      incident: t.INCIDENT,
      customerType: t.CUSTOMER_TYPE ?? 'HVC_DIAMOND',
      status: t.STATUS_UPDATE ?? 'open',
      reportedAt: t.REPORTED_DATE ? new Date(t.REPORTED_DATE) : new Date(),
      workzone: t.WORKZONE,
      contactName: t.CONTACT_NAME,
      serviceNo: t.SERVICE_NO,
      technicianName: t.users?.nama ?? null,
      teknisiUserId: t.teknisi_user_id,
      syncDate: t.sync_date ? t.sync_date.toISOString() : '',
    }));
  }

  /**
   * Get count of Diamond tickets synced TODAY
   */
  static async getAlertDiamondCount(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
  ): Promise<number> {
    const todayWibStr = todayWIB();
    const startOfDayUTC = formatInTimeZone(
      new Date(`${todayWibStr}T00:00:00`),
      WIB,
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    );
    const endOfDayUTC = formatInTimeZone(
      new Date(`${todayWibStr}T23:59:59.999`),
      WIB,
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    );

    const workzoneWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      forcedWorkzoneId,
    );

    const where: Record<string, any> = {
      sync_date: {
        gte: new Date(startOfDayUTC),
        lt: new Date(endOfDayUTC),
      },
      CUSTOMER_TYPE: 'HVC_DIAMOND',
      STATUS_UPDATE: { notIn: ['close', 'closed'] },
      ...workzoneWhere,
    };

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
    // Check teknisi FIRST (before isAdminRole narrows the type)
    if (role === 'teknisi') {
      console.log(
        `[AlertDiamond] Teknisi ${userId} — filtering by teknisi_user_id`,
      );
      return {
        AND: [
          { WORKZONE: { not: null } },
          { teknisi_user_id: userId },
        ],
      };
    }

    // Admin forced selector — only admins can override
    if (forcedWorkzoneId && isAdminRole(role)) {
      console.log(
        `[AlertDiamond] Admin override workzone: ${forcedWorkzoneId}`,
      );
      return { WORKZONE: { contains: forcedWorkzoneId } };
    }

    // Admin/other roles — filter by user's assigned workzones
    if (isAdminRole(role)) {
      const workzones = await getWorkzonesForUser(userId);
      console.log(
        `[AlertDiamond] Admin ${userId} (role: ${role}) workzones:`,
        workzones,
      );
      if (workzones.length === 0) {
        // No workzones assigned — return impossible filter
        console.log(
          `[AlertDiamond] No workzones for admin ${userId}, returning empty result`,
        );
        return { id_ticket: 0 };
      }
      return { WORKZONE: { in: workzones } };
    }

    // Default — no filter
    console.log(
      `[AlertDiamond] Unknown role "${role}" for user ${userId}, no workzone filter`,
    );
    return {};
  }
}
