import db from '@/app/libs/db';

export class TicketService {
  // =====================================================
  // 👨‍🔧 GET USERS WITH ROLE TEKNISI
  // =====================================================
  static async getTeknisiUsers() {
    const [rows]: any = await db.query(`
      SELECT 
        u.id_user AS idUser,
        u.nama AS nama,
        u.nik AS nik
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id_role
      WHERE r.key = 'teknisi'
      ORDER BY u.nama ASC
    `);

    return rows;
  }

  // =====================================================
  // 🔹 GET TICKETS (ADMIN & TEKNISI)
  // =====================================================
  static async getTickets(
    role: string,
    teknisiUserId?: number,
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

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      whereClause += `
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
      whereClause += ' AND t.HASIL_VISIT = ?';
      params.push(hasilVisit);
    }

    if (workzone) {
      whereClause += ' AND t.WORKZONE = ?';
      params.push(workzone);
    }

    if (role === 'teknisi') {
      whereClause += ' AND t.teknisi_user_id = ?';
      params.push(teknisiUserId);
    }

    // COUNT
    const [countResult]: any = await db.query(
      `SELECT COUNT(*) as total FROM ticket t ${whereClause}`,
      params,
    );

    const total = countResult[0]?.total || 0;

    // DATA
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
        t.ALAMAT AS alamat,
        t.teknisi_user_id AS teknisiUserId,
        t.rca AS rca,
        t.sub_rca AS subRca,

        u.nama AS technicianName

      FROM ticket t
      LEFT JOIN users u ON t.teknisi_user_id = u.id_user

      ${whereClause}
      ORDER BY t.REPORTED_DATE DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: rows,
    };
  }

  // =====================================================
  // 🆕 GET UNASSIGNED TICKETS (ADMIN)
  // =====================================================
  static async getUnassignedTickets() {
    const [rows]: any = await db.query(`
      SELECT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.SUMMARY AS summary,
        t.REPORTED_DATE AS reportedDate,
        t.CONTACT_NAME AS contactName,
        t.SERVICE_NO AS serviceNo,
        t.STATUS AS status,
        t.HASIL_VISIT AS hasilVisit
      FROM ticket t
      WHERE t.teknisi_user_id IS NULL
        AND t.HASIL_VISIT = 'OPEN'
      ORDER BY t.REPORTED_DATE DESC
    `);

    return rows;
  }

  // =====================================================
  // 📌 ASSIGN
  // =====================================================
  static async assignToUser(ticketId: number, teknisiUserId: number) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [user]: any = await connection.query(
        `
        SELECT u.id_user
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id_role
        WHERE u.id_user = ? AND r.key = 'teknisi'
        LIMIT 1
        `,
        [teknisiUserId],
      );

      if (!user.length) {
        throw new Error('Technician not found');
      }

      await connection.query(
        `
        UPDATE ticket
        SET teknisi_user_id = ?, hasil_visit = 'ASSIGNED'
        WHERE id_ticket = ?
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

  // =====================================================
  // 🔹 PICKUP
  // =====================================================
  static async pickup(ticketId: number, teknisiUserId: number) {
    const [rows]: any = await db.query(
      `SELECT teknisi_user_id FROM ticket WHERE id_ticket=?`,
      [ticketId],
    );

    if (!rows.length) throw new Error('Ticket not found');

    const dbTechId = Number(rows[0].teknisi_user_id);
    if (dbTechId !== teknisiUserId)
      throw new Error('Unauthorized - Ticket not assigned to you');

    await db.query(
      `UPDATE ticket SET hasil_visit='on_progress' WHERE id_ticket=?`,
      [ticketId],
    );

    return { message: 'Ticket picked up successfully' };
  }

  // =====================================================
  // 🔹 CLOSE
  // =====================================================
  static async close(
    ticketId: number,
    teknisiUserId: number,
    rca: string,
    subRca: string,
  ) {
    const [rows]: any = await db.query(
      `SELECT teknisi_user_id FROM ticket WHERE id_ticket=?`,
      [ticketId],
    );

    if (!rows.length) throw new Error('Ticket not found');

    const dbTechId = Number(rows[0].teknisi_user_id);

    if (dbTechId !== teknisiUserId)
      throw new Error('Unauthorized - Ticket not assigned to you');

    if (!rca || !subRca) throw new Error('RCA dan Sub RCA wajib diisi');

    // 🔥 VALIDASI MINIMAL 2 EVIDENCE
    const [evidence]: any = await db.query(
      `SELECT COUNT(*) as total 
        FROM ticket_evidence 
        WHERE ticket_id=?`,
      [ticketId],
    );

    const totalEvidence = Number(evidence[0].total);

    if (totalEvidence < 2)
      throw new Error(
        'Minimal 2 evidence (Before & After) wajib sebelum close',
      );

    await db.query(
      `
    UPDATE ticket 
    SET 
      hasil_visit = 'CLOSE',
      rca = ?,
      sub_rca = ?,
      closed_at = NOW()
    WHERE id_ticket = ?
    `,
      [rca, subRca, ticketId],
    );

    return { message: 'Ticket closed successfully' };
  }

  // =====================================================
  // 📊 STATS
  // =====================================================
  static async getStats() {
    const [rows]: any = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN teknisi_user_id IS NULL THEN 1 ELSE 0 END) AS UNASSIGNED,
        SUM(CASE WHEN hasil_visit='OPEN' THEN 1 ELSE 0 END) AS OPEN,
        SUM(CASE WHEN hasil_visit='ASSIGNED' THEN 1 ELSE 0 END) AS ASSIGNED,
        SUM(CASE WHEN hasil_visit='CLOSE' THEN 1 ELSE 0 END) AS CLOSED
      FROM ticket
    `);

    return rows[0];
  }

  // =====================================================
  // 🔍 SEARCH BY CONTACT NAME
  // =====================================================
  static async searchByContactName(
    contactName: string,
    role: string,
    userId?: number,
  ) {
    const keyword = `%${contactName}%`;
    let query = `
      SELECT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.CONTACT_NAME AS contactName,
        t.SERVICE_NO AS serviceNo,
        t.STATUS AS status,
        t.HASIL_VISIT AS hasilVisit,
        u.nama AS technicianName
      FROM ticket t
      LEFT JOIN users u ON t.teknisi_user_id = u.id_user
      WHERE t.CONTACT_NAME LIKE ?
    `;

    if (role === 'teknisi') {
      query += ' AND t.teknisi_user_id = ?';
    }

    query += ' ORDER BY t.REPORTED_DATE DESC LIMIT 50';

    const params = role === 'teknisi' ? [keyword, userId] : [keyword];
    const [rows]: any = await db.query(query, params);

    return rows;
  }

  // =====================================================
  // 🔍 SEARCH BY SERVICE NO
  // =====================================================
  static async searchByServiceNo(
    serviceNo: string,
    role: string,
    userId?: number,
  ) {
    const keyword = `%${serviceNo}%`;
    let query = `
      SELECT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.CONTACT_NAME AS contactName,
        t.SERVICE_NO AS serviceNo,
        t.STATUS AS status,
        t.HASIL_VISIT AS hasilVisit,
        u.nama AS technicianName
      FROM ticket t
      LEFT JOIN users u ON t.teknisi_user_id = u.id_user
      WHERE t.SERVICE_NO LIKE ?
    `;

    if (role === 'teknisi') {
      query += ' AND t.teknisi_user_id = ?';
    }

    query += ' ORDER BY t.REPORTED_DATE DESC LIMIT 50';

    const params = role === 'teknisi' ? [keyword, userId] : [keyword];
    const [rows]: any = await db.query(query, params);

    return rows;
  }

  // =====================================================
  // 🔍 GENERAL SEARCH
  // =====================================================
  static async search(query: string, role: string, userId?: number) {
    const keyword = `%${query}%`;
    let sql = `
      SELECT
        t.id_ticket AS idTicket,
        t.INCIDENT AS ticket,
        t.SUMMARY AS summary,
        t.CONTACT_NAME AS contactName,
        t.SERVICE_NO AS serviceNo,
        t.STATUS AS status,
        t.HASIL_VISIT AS hasilVisit,
        u.nama AS technicianName
      FROM ticket t
      LEFT JOIN users u ON t.teknisi_user_id = u.id_user
      WHERE (t.CONTACT_NAME LIKE ? OR t.SERVICE_NO LIKE ? OR t.INCIDENT LIKE ?)
    `;

    if (role === 'teknisi') {
      sql += ' AND t.teknisi_user_id = ?';
    }

    sql += ' ORDER BY t.REPORTED_DATE DESC LIMIT 50';

    const params =
      role === 'teknisi'
        ? [keyword, keyword, keyword, userId]
        : [keyword, keyword, keyword];
    const [rows]: any = await db.query(sql, params);

    return rows;
  }

  // =====================================================
  // 👨 GET CUSTOMER TYPE
  // =====================================================
  static async getCustomerType() {
    const [rows]: any = await db.query(`
      SELECT 
        u.CUTOMER_TYPE AS customerType
      FROM tickets u
      ORDER BY u.customerType ASC
    `);

    return rows;
  }
}
