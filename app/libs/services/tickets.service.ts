import db from '@/app/libs/db';

export class TicketService {
  /* =====================================================
     ACCESS FILTER BUILDER (SESUIAI ERD)
  ===================================================== */

  private static buildAccessFilter(role: string, userId: number) {
    let joinClause = '';
    let whereClause = '';
    const params: any[] = [];

    if (role === 'super_admin') {
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

    let baseWhere = ' WHERE 1=1 ';
    const params: any[] = [];

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

    if (workzone) {
      baseWhere += ` AND t.WORKZONE = ?`;
      params.push(workzone);
    }

    const {
      joinClause,
      whereClause,
      params: roleParams,
    } = this.buildAccessFilter(role, userId);

    const finalWhere = baseWhere + whereClause;
    const finalParams = [...params, ...roleParams];

    /* ---------- COUNT ---------- */

    const [count]: any = await db.query(
      `
    SELECT COUNT(*) as total
    FROM ticket t
    ${joinClause}
    ${finalWhere}
    `,
      finalParams,
    );

    const total = count[0]?.total || 0;

    /* ---------- DATA ---------- */

    const [rows]: any = await db.query(
      `
    SELECT
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
    ${joinClause}
    ${finalWhere}
    ORDER BY STR_TO_DATE(t.REPORTED_DATE, '%Y-%m-%d %H:%i:%s') DESC
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
     ASSIGN
  ===================================================== */

  static async assignToUser(ticketId: number, teknisiUserId: number) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [ticket]: any = await connection.query(
        `SELECT id_ticket FROM ticket WHERE id_ticket=?`,
        [ticketId],
      );

      if (!ticket.length) throw new Error('Ticket not found');

      const [user]: any = await connection.query(
        `
        SELECT u.id_user
        FROM users u
        JOIN roles r ON u.role_id = r.id_role
        WHERE u.id_user=? AND r.key='teknisi'
        `,
        [teknisiUserId],
      );

      if (!user.length) throw new Error('Technician not found');

      await connection.query(
        `
        UPDATE ticket
        SET teknisi_user_id=?, hasil_visit='ASSIGNED'
        WHERE id_ticket=?
        `,
        [teknisiUserId, ticketId],
      );

      await connection.commit();
      return { message: 'Ticket assigned successfully' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /* =====================================================
     PICKUP
  ===================================================== */

  static async pickup(ticketId: number, teknisiUserId: number) {
    const [rows]: any = await db.query(
      `SELECT teknisi_user_id, hasil_visit FROM ticket WHERE id_ticket=?`,
      [ticketId],
    );

    if (!rows.length) throw new Error('Ticket not found');

    const ticket = rows[0];

    if (Number(ticket.teknisi_user_id) !== teknisiUserId)
      throw new Error('Unauthorized');

    if (ticket.hasil_visit !== 'ASSIGNED')
      throw new Error('Ticket not ready for pickup');

    await db.query(
      `UPDATE ticket SET hasil_visit='ON_PROGRESS' WHERE id_ticket=?`,
      [ticketId],
    );

    return { message: 'Ticket picked up successfully' };
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
    const [rows]: any = await db.query(
      `SELECT teknisi_user_id, hasil_visit FROM ticket WHERE id_ticket=?`,
      [ticketId],
    );

    if (!rows.length) throw new Error('Ticket not found');

    const ticket = rows[0];

    if (Number(ticket.teknisi_user_id) !== teknisiUserId)
      throw new Error('Unauthorized');

    if (ticket.hasil_visit === 'CLOSE')
      throw new Error('Ticket already closed');

    if (!rca || !subRca) throw new Error('RCA dan Sub RCA wajib diisi');

    const [evidence]: any = await db.query(
      `SELECT COUNT(*) as total FROM ticket_evidence WHERE ticket_id=?`,
      [ticketId],
    );

    if (Number(evidence[0].total) < 2)
      throw new Error('Minimal 2 evidence wajib sebelum close');

    await db.query(
      `
      UPDATE ticket
      SET hasil_visit='CLOSE',
          rca=?,
          sub_rca=?,
          closed_at=NOW()
      WHERE id_ticket=?
      `,
      [rca, subRca, ticketId],
    );

    return { message: 'Ticket closed successfully' };
  }

  /* =====================================================
     STATS (ROLE SAFE)
  ===================================================== */

  static async getStats(role: string, userId: number) {
    const { joinClause, whereClause, params } = this.buildAccessFilter(
      role,
      userId,
    );

    const [rows]: any = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN teknisi_user_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN hasil_visit='OPEN' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN hasil_visit='ASSIGNED' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN hasil_visit='CLOSE' THEN 1 ELSE 0 END) AS closed
      FROM ticket t
      ${joinClause}
      WHERE 1=1
      ${whereClause}
      `,
      params,
    );

    return rows[0];
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
