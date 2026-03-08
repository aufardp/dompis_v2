import prisma from '@/app/libs/prisma';

export class TicketStatsService {
  static async getDashboardStats(filters?: {
    dept?: string | null;
    workzone?: string | null;
    ctype?: string | null;
  }) {
    const dept = filters?.dept;
    const workzone = filters?.workzone;
    const ctype = filters?.ctype;

    const conditions: string[] = [];
    const params: any[] = [];

    // Build WHERE clause dynamically
    if (workzone) {
      conditions.push(`WORKZONE LIKE ?`);
      params.push(`%${workzone}%`);
    }

    if (dept === 'b2c') {
      conditions.push(
        `CUSTOMER_TYPE IN ('REGULER','HVC_GOLD','HVC_PLATINUM','HVC_DIAMOND')`,
      );
    } else if (dept === 'b2b') {
      conditions.push(
        `(CUSTOMER_TYPE NOT IN ('REGULER','HVC_GOLD','HVC_PLATINUM','HVC_DIAMOND') OR CUSTOMER_TYPE IS NULL)`,
      );
    }

    if (ctype) {
      conditions.push(`CUSTOMER_TYPE = ?`);
      params.push(ctype);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        STATUS_UPDATE,
        CUSTOMER_TYPE,
        JENIS_TIKET,
        FLAGGING_MANJA,
        GUARANTE_STATUS,
        COUNT(*) as total
      FROM ticket
      ${where}
      GROUP BY
        STATUS_UPDATE,
        CUSTOMER_TYPE,
        JENIS_TIKET,
        FLAGGING_MANJA,
        GUARANTE_STATUS
    `, ...params);

    const stats: any = {
      status: {},
      customerType: {},
      jenis: {},
      flagging: {},
      guarantee: 0,
      total: 0,
    };

    for (const r of rows as any[]) {
      const total = Number(r.total);

      const status = (r.STATUS_UPDATE ?? 'open').toLowerCase();
      stats.status[status] = (stats.status[status] || 0) + total;

      const ctypeVal = r.CUSTOMER_TYPE ?? 'UNKNOWN';
      stats.customerType[ctypeVal] =
        (stats.customerType[ctypeVal] || 0) + total;

      const jenis = r.JENIS_TIKET ?? 'UNKNOWN';
      stats.jenis[jenis] = (stats.jenis[jenis] || 0) + total;

      if (r.FLAGGING_MANJA) {
        stats.flagging[r.FLAGGING_MANJA] =
          (stats.flagging[r.FLAGGING_MANJA] || 0) + total;
      }

      if (r.GUARANTE_STATUS === 'guarantee') {
        stats.guarantee += total;
      }

      stats.total += total;
    }

    return stats;
  }
}
