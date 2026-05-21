import prisma from '@/app/libs/prisma';
import { todayWibDateForDb } from '@/lib/timezone';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

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

    const where: Record<string, any> = {
      // Only today's sync (WIB date)
      sync_date: todayWib,
      // Only Diamond tickets
      customer_type: 'HVC_DIAMOND',
      // Exclude closed tickets
      status_update: statusFilter,
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
   * Get count of Diamond tickets synced TODAY
   */
  static async getAlertDiamondCount(
    role: string,
    userId: number,
    forcedWorkzoneId?: string,
  ): Promise<number> {
    const todayWib = todayWibDateForDb();

    const workzoneWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      forcedWorkzoneId,
    );

    const where: Record<string, any> = {
      sync_date: todayWib,
      customer_type: 'HVC_DIAMOND',
      status_update: { notIn: ['close', 'closed'] },
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
          { workzone: { not: null } },
          { teknisi_user_id: userId },
        ],
      };
    }

    // Admin forced selector — only admins can override
    if (forcedWorkzoneId && isAdminRole(role)) {
      console.log(
        `[AlertDiamond] Admin override workzone: ${forcedWorkzoneId}`,
      );
      return { workzone: { contains: forcedWorkzoneId } };
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
      return { workzone: { in: workzones } };
    }

    // Default — no filter
    console.log(
      `[AlertDiamond] Unknown role "${role}" for user ${userId}, no workzone filter`,
    );
    return {};
  }
}
