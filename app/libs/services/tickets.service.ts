import db from '@/app/libs/db';
import {
  TicketWorkflowService,
  type ActorContext,
} from '@/app/libs/services/ticketWorkflow.service';

export class TicketService {
  /* =====================================================
     ACCESS FILTER BUILDER (SESUIAI ERD)
  ===================================================== */

  private static buildAccessFilter(role: string, userId: number) {
    let joinClause = '';
    let whereClause = '';
    const params: any[] = [];

    if (role === 'super_admin' || role === 'superadmin') {
      return { joinClause, whereClause, params };
    }

    if (role === 'admin') {
      joinClause += `
        JOIN service_area sa
          ON LOWER(REPLACE(t.WORKZONE,' ','')) 
             LIKE CONCAT('%', LOWER(REPLACE(sa.nama_sa,' ','')), '%')
        JOIN user_sa us
          ON sa.id_sa = us.sa_id
      `;
      whereClause += ` AND us.user_id = ?`;
      params.push(userId);
    }

    if (role === 'teknisi') {
      whereClause += ` AND t.teknisi_user_id = ?`;
      params.push(userId);
    }

    return { joinClause, whereClause, params };
  }

  /* =====================================================
     GET TICKETS (ROLE AWARE)
  ===================================================== */

  static async getTickets(
    role: string,
    userId: number,
    filters?: {
      search?: string;
      hasilVisit?: string;
      workzone?: string; // service area id (id_sa) from dropdown
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

    let baseWhere = ' WHERE 1=1 ';
    const params: any[] = [];

    const serviceAreaId = Number(workzone);
    const hasServiceAreaFilter =
      Number.isFinite(serviceAreaId) && serviceAreaId > 0;

    if (search) {
      baseWhere += `
      AND (
        t.INCIDENT LIKE ?
        OR t.CONTACT_NAME LIKE ?
        OR t.SERVICE_NO LIKE ?
        OR t.CONTACT_PHONE LIKE ?
      )
    `;
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    if (hasilVisit) {
      baseWhere += ` AND t.HASIL_VISIT = ?`;
      params.push(hasilVisit);
    }

    // Filter by selected service area (maps ticket.WORKZONE -> service_area.nama_sa)
    let filterJoinClause = '';
    if (hasServiceAreaFilter) {
      if (role === 'admin') {
        // admin already joins `service_area sa` in buildAccessFilter
        baseWhere += ` AND sa.id_sa = ?`;
        params.push(serviceAreaId);
      } else {
        filterJoinClause += `
          JOIN service_area sa_filter
            ON LOWER(REPLACE(t.WORKZONE,' ',''))
               LIKE CONCAT('%', LOWER(REPLACE(sa_filter.nama_sa,' ','')), '%')
        `;

        baseWhere += ` AND sa_filter.id_sa = ?`;
        params.push(serviceAreaId);
      }
    }

    const {
      joinClause,
      whereClause,
      params: roleParams,
    } = this.buildAccessFilter(role, userId);

    const finalJoinClause = joinClause + filterJoinClause;

    const finalWhere = baseWhere + whereClause;
    const finalParams = [...params, ...roleParams];

    /* ---------- COUNT ---------- */

    const [count]: any = await db.query(
      `
    SELECT COUNT(DISTINCT t.id_ticket) as total
    FROM ticket t
    ${finalJoinClause}
    ${finalWhere}
    `,
      finalParams,
    );

    const total = count[0]?.total || 0;

    /* ---------- DATA ---------- */

    const [rows]: any = await db.query(
      `
    SELECT DISTINCT
      t.id_ticket AS idTicket,
      t.INCIDENT AS ticket,
      t.SUMMARY AS summary,
      t.REPORTED_DATE AS reportedDate,
      t.OWNER_GROUP AS ownerGroup,
      t.SERVICE_TYPE AS serviceType,
      t.CUSTOMER_TYPE AS customerType,
      t.SERVICE_NO AS serviceNo,
      t.CONTACT_NAME AS contactName,
      t.CONTACT_PHONE AS contactPhone,
      t.DEVICE_NAME AS deviceName,
      t.STATUS AS status,
      t.HASIL_VISIT AS hasilVisit,
      t.BOOKING_DATE AS bookingDate,
      t.SYMPTOM AS symptom,
      t.DESCRIPTION_ACTUAL_SOLUTION AS descriptionActualSolution,
      t.WORKZONE AS workzone,
      t.CUSTOMER_SEGMENT AS customerSegment,
      t.SOURCE_TICKET AS sourceTicket,
      t.JENIS_TIKET AS jenisTiket,
      t.JAM_EXPIRED_24_JAM_REGULER AS maxTtrReguler,
      t.JAM_EXPIRED_12_JAM_GOLD AS maxTtrGold,
      t.JAM_EXPIRED_6_JAM_PLATINUM AS maxTtrPlatinum,
      t.JAM_EXPIRED_3_JAM_DIAMOND AS maxTtrDiamond,
      t.teknisi_user_id AS teknisiUserId,
      t.rca AS rca,
      t.sub_rca AS subRca,
      t.ALAMAT AS alamat,
      t.closed_at AS closedAt,
      u.nama AS technicianName
    FROM ticket t
    LEFT JOIN users u
      ON t.teknisi_user_id = u.id_user
    ${finalJoinClause}
    ${finalWhere}
    ORDER BY STR_TO_DATE(t.REPORTED_DATE, '%Y-%m-%d %H:%i:%s') DESC, t.id_ticket DESC
    LIMIT ? OFFSET ?
    `,
      [...finalParams, limit, offset],
    );

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: rows,
    };
  }

  /* =====================================================
     GET UNASSIGNED (ROLE SAFE)
  ===================================================== */

  static async getUnassignedTickets(role: string, userId: number) {
    const { joinClause, whereClause, params } = this.buildAccessFilter(
      role,
      userId,
    );

    const [rows]: any = await db.query(
      `
      SELECT t.*
      FROM ticket t
      ${joinClause}
      WHERE t.teknisi_user_id IS NULL
        AND t.HASIL_VISIT = 'OPEN'
      ${whereClause}
      ORDER BY t.REPORTED_DATE DESC
      `,
      params,
    );

    return rows;
  }

  /* =====================================================
     QUICK SEARCH (ROLE AWARE)
  ===================================================== */

  static async search(incident: string, role: string, userId: number) {
    const { joinClause, whereClause, params } = this.buildAccessFilter(
      role,
      userId,
    );

    const keyword = `%${incident}%`;

    const [rows]: any = await db.query(
      `
      SELECT DISTINCT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.SUMMARY AS summary,
        t.REPORTED_DATE AS reportedDate,
        t.SERVICE_NO AS serviceNo,
        t.CONTACT_NAME AS contactName,
        t.CONTACT_PHONE AS contactPhone,
        t.WORKZONE AS workzone,
        t.HASIL_VISIT AS hasilVisit,
        t.teknisi_user_id AS teknisiUserId,
        u.nama AS technicianName
      FROM ticket t
      LEFT JOIN users u
        ON t.teknisi_user_id = u.id_user
      ${joinClause}
      WHERE 1=1
        AND t.INCIDENT LIKE ?
      ${whereClause}
      ORDER BY t.id_ticket DESC
      LIMIT 20
      `,
      [keyword, ...params],
    );

    return rows;
  }

  static async searchByContactName(
    contactName: string,
    role: string,
    userId: number,
  ) {
    const { joinClause, whereClause, params } = this.buildAccessFilter(
      role,
      userId,
    );

    const keyword = `%${contactName}%`;

    const [rows]: any = await db.query(
      `
      SELECT DISTINCT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.CONTACT_NAME AS contactName,
        t.CONTACT_PHONE AS contactPhone,
        t.SERVICE_NO AS serviceNo,
        t.WORKZONE AS workzone,
        t.HASIL_VISIT AS hasilVisit
      FROM ticket t
      ${joinClause}
      WHERE 1=1
        AND t.CONTACT_NAME LIKE ?
      ${whereClause}
      ORDER BY t.id_ticket DESC
      LIMIT 20
      `,
      [keyword, ...params],
    );

    return rows;
  }

  static async searchByServiceNo(
    serviceNo: string,
    role: string,
    userId: number,
  ) {
    const { joinClause, whereClause, params } = this.buildAccessFilter(
      role,
      userId,
    );

    const keyword = `%${serviceNo}%`;

    const [rows]: any = await db.query(
      `
      SELECT DISTINCT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.SERVICE_NO AS serviceNo,
        t.CONTACT_NAME AS contactName,
        t.CONTACT_PHONE AS contactPhone,
        t.WORKZONE AS workzone,
        t.HASIL_VISIT AS hasilVisit
      FROM ticket t
      ${joinClause}
      WHERE 1=1
        AND t.SERVICE_NO LIKE ?
      ${whereClause}
      ORDER BY t.id_ticket DESC
      LIMIT 20
      `,
      [keyword, ...params],
    );

    return rows;
  }

  static async getTicketsByUser(userId: number) {
    const [rows]: any = await db.query(
      `
      SELECT DISTINCT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.SUMMARY AS summary,
        t.REPORTED_DATE AS reportedDate,
        t.WORKZONE AS workzone,
        t.HASIL_VISIT AS hasilVisit,
        t.teknisi_user_id AS teknisiUserId
      FROM ticket t
      JOIN service_area sa
        ON LOWER(REPLACE(t.WORKZONE,' ',''))
           LIKE CONCAT('%', LOWER(REPLACE(sa.nama_sa,' ','')), '%')
      JOIN user_sa us
        ON sa.id_sa = us.sa_id
      WHERE us.user_id = ?
      ORDER BY STR_TO_DATE(t.REPORTED_DATE, '%Y-%m-%d %H:%i:%s') DESC, t.id_ticket DESC
      LIMIT 200
      `,
      [userId],
    );

    return rows;
  }

  static async getTeknisiUsers() {
    const [rows]: any = await db.query(
      `
      SELECT u.id_user, u.nama, u.nik
      FROM users u
      JOIN roles r ON r.id_role = u.role_id
      WHERE r.key = 'teknisi'
      ORDER BY u.nama ASC
      `,
    );

    return rows;
  }

  /* =====================================================
     ASSIGN
   ===================================================== */

  static async assignToUser(
    ticketId: number,
    teknisiUserId: number,
    actor: ActorContext,
  ) {
    return TicketWorkflowService.assignToUser(ticketId, teknisiUserId, actor);
  }

  /* =====================================================
     UNASSIGN (ADMIN/HELPDESK/SUPERADMIN)
  ===================================================== */

  static async unassign(ticketId: number, role?: string, userId?: number) {
    if (!role || !userId) throw new Error('Unauthorized');
    return TicketWorkflowService.unassignTicket(ticketId, {
      id_user: userId,
      role,
    });
  }

  /* =====================================================
     PICKUP
   ===================================================== */

  static async pickup(ticketId: number, teknisiUserId: number) {
    return TicketWorkflowService.pickupTicket(ticketId, {
      id_user: teknisiUserId,
      role: 'teknisi',
    });
  }

  /* =====================================================
     CLOSE
   ===================================================== */

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

  /* =====================================================
     STATS (ROLE SAFE)
  ===================================================== */

  static async getStats(role: string, userId: number, saId?: number) {
    const { joinClause, whereClause, params } = this.buildAccessFilter(
      role,
      userId,
    );

    let extraJoin = '';
    let extraWhere = '';
    const extraParams: any[] = [];

    const serviceAreaId = Number(saId);
    const hasSaFilter = Number.isFinite(serviceAreaId) && serviceAreaId > 0;

    if (hasSaFilter) {
      if (role === 'admin') {
        extraWhere += ` AND sa.id_sa = ?`;
        extraParams.push(serviceAreaId);
      } else {
        extraJoin += `
          JOIN service_area sa_filter
            ON LOWER(REPLACE(t.WORKZONE,' ',''))
               LIKE CONCAT('%', LOWER(REPLACE(sa_filter.nama_sa,' ','')), '%')
        `;
        extraWhere += ` AND sa_filter.id_sa = ?`;
        extraParams.push(serviceAreaId);
      }
    }

    const finalJoin = joinClause + extraJoin;
    const finalParams = [...params, ...extraParams];

    // Use DISTINCT tickets to avoid join-multiplication inflating counts
    const [rows]: any = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(x.unassigned) AS unassigned,
        SUM(x.open) AS open,
        SUM(x.assigned) AS assigned,
        SUM(x.closed) AS closed
      FROM (
        SELECT DISTINCT
          t.id_ticket,
          CASE WHEN t.teknisi_user_id IS NULL THEN 1 ELSE 0 END AS unassigned,
          CASE WHEN t.hasil_visit='OPEN' THEN 1 ELSE 0 END AS open,
          CASE WHEN t.hasil_visit='ASSIGNED' THEN 1 ELSE 0 END AS assigned,
          CASE WHEN t.hasil_visit='CLOSE' THEN 1 ELSE 0 END AS closed
        FROM ticket t
        ${finalJoin}
        WHERE 1=1
        ${whereClause}
        ${extraWhere}
      ) x
      `,
      finalParams,
    );

    return rows[0];
  }

  static async getStatsByServiceArea(
    role: string,
    userId: number,
    saId?: number,
  ) {
    const serviceAreaId = Number(saId);
    const hasSaFilter = Number.isFinite(serviceAreaId) && serviceAreaId > 0;

    let subWhere = ' WHERE 1=1 ';
    const params: any[] = [];

    // role restrictions
    if (role === 'teknisi') {
      subWhere += ' AND t.teknisi_user_id = ?';
      params.push(userId);
    }

    // admin restrictions applied after mapping via user_sa
    let adminJoin = '';
    if (role === 'admin') {
      adminJoin += `
        JOIN user_sa us
          ON us.sa_id = sa.id_sa
         AND us.user_id = ?
      `;
      params.push(userId);
    }

    if (hasSaFilter) {
      params.push(serviceAreaId);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        sa.id_sa AS id_sa,
        sa.nama_sa AS nama_sa,
        COUNT(*) AS total,
        SUM(CASE WHEN x.teknisi_user_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN x.hasil_visit='OPEN' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN x.hasil_visit='ASSIGNED' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN x.hasil_visit='CLOSE' THEN 1 ELSE 0 END) AS closed
      FROM (
        SELECT
          t.id_ticket,
          t.teknisi_user_id,
          t.hasil_visit,
          (
            SELECT sa2.id_sa
            FROM service_area sa2
            WHERE LOWER(REPLACE(t.WORKZONE,' ',''))
              LIKE CONCAT('%', LOWER(REPLACE(sa2.nama_sa,' ','')), '%')
            ORDER BY LENGTH(LOWER(REPLACE(sa2.nama_sa,' ',''))) DESC
            LIMIT 1
          ) AS sa_id
        FROM ticket t
        ${subWhere}
      ) x
      JOIN service_area sa ON sa.id_sa = x.sa_id
      ${adminJoin}
      WHERE x.sa_id IS NOT NULL
      ${hasSaFilter ? ' AND sa.id_sa = ?' : ''}
      GROUP BY sa.id_sa, sa.nama_sa
      ORDER BY sa.nama_sa ASC
      `,
      // Params are: role filters in subquery, admin join user_id (if any), optional sa filter
      params,
    );

    return rows;
  }

  /* =====================================================
     CUSTOMER TYPE
  ===================================================== */

  static async getCustomerType() {
    const [rows]: any = await db.query(`
      SELECT DISTINCT CUSTOMER_TYPE AS customerType
      FROM ticket
      ORDER BY CUSTOMER_TYPE ASC
    `);

    return rows;
  }
}
