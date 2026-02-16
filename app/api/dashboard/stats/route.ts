import { NextResponse } from 'next/server';
import db from '@/app/libs/db';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(request: Request) {
  try {
    await protectApi(['admin', 'teknisi', 'helpdesk', 'superadmin']);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const areaId = searchParams.get('areaId');

    if (type === 'technicians') {
      const query = `
        SELECT 
          u.id_user as id,
          u.nik,
          u.nama,
          u.jabatan,
          COUNT(t.id_ticket) as total_orders,
          SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN t.status != 'Closed' THEN 1 ELSE 0 END) as unfinished_orders,
          SUM(CASE 
            WHEN t.status != 'Closed' AND t.technician_id IS NOT NULL 
            THEN 1 ELSE 0 END) as active_orders
        FROM users u
        INNER JOIN roles r ON u.role_id = r.id_role AND r.\`key\` = 'teknisi'
        LEFT JOIN ticket t ON u.id_user = t.technician_id
        ${areaId ? 'WHERE u.area_id = ?' : ''}
        GROUP BY u.id_user
        ORDER BY u.nama ASC
      `;

      const params = areaId ? [areaId] : [];
      const [rows]: any = await db.query(query, params);

      return NextResponse.json({
        success: true,
        data: rows,
      });
    }

    if (type === 'stats') {
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM users u INNER JOIN roles r ON u.role_id = r.id_role AND r.\`key\` = 'teknisi' ${areaId ? 'WHERE u.area_id = ?' : ''}) as total_technicians,
          (SELECT COUNT(DISTINCT t.technician_id) 
           FROM ticket t 
           WHERE t.status != 'Closed' AND t.technician_id IS NOT NULL
           ${areaId ? 'AND t.area_id = ?' : ''}) as busy_technicians,
          (SELECT COUNT(*) FROM users u 
           INNER JOIN roles r ON u.role_id = r.id_role AND r.\`key\` = 'teknisi'
           LEFT JOIN ticket t ON u.id_user = t.technician_id AND t.status != 'Closed'
           WHERE t.id_ticket IS NULL
           ${areaId ? 'AND u.area_id = ?' : ''}) as idle_technicians,
          (SELECT COUNT(*) FROM ticket ${areaId ? 'WHERE area_id = ?' : ''}) as total_tickets,
          (SELECT COUNT(*) FROM ticket WHERE status = 'Closed' ${areaId ? 'AND area_id = ?' : ''}) as completed_tickets,
          (SELECT COUNT(*) FROM ticket WHERE status != 'Closed' ${areaId ? 'AND area_id = ?' : ''}) as unfinished_tickets
      `;

      let params: any[] = [];
      if (areaId) {
        params = [areaId, areaId, areaId, areaId, areaId, areaId];
      }

      const [rows]: any = await db.query(query, params);
      const stats = rows[0];

      return NextResponse.json({
        success: true,
        data: {
          totalTechnicians: Number(stats.total_technicians),
          busyTechnicians: Number(stats.busy_technicians),
          idleTechnicians: Number(stats.idle_technicians),
          totalTickets: Number(stats.total_tickets),
          completedTickets: Number(stats.completed_tickets),
          unfinishedTickets: Number(stats.unfinished_tickets),
        },
      });
    }

    return NextResponse.json(
      { success: false, message: 'Invalid type parameter' },
      { status: 400 },
    );
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
