import { NextResponse } from 'next/server';
import db from '@/app/libs/db';
import { protectApi } from '@/app/libs/protectApi';

export async function GET() {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    // super admin -> return all service areas
    if (user.role === 'super_admin' || user.role === 'superadmin') {
      const [rows]: any = await db.query(
        `SELECT CAST(id_sa AS CHAR) AS value, nama_sa AS label FROM service_area ORDER BY nama_sa ASC`,
      );

      return NextResponse.json({ success: true, data: rows });
    }

    // admin/helpdesk -> only SA mapped to this user_id via user_sa
    const [rows]: any = await db.query(
      `
      SELECT CAST(sa.id_sa AS CHAR) AS value, sa.nama_sa AS label
      FROM user_sa us
      JOIN service_area sa ON us.sa_id = sa.id_sa
      WHERE us.user_id = ?
      ORDER BY sa.nama_sa ASC
      `,
      [user.id_user],
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Server Error' },
      { status: 500 },
    );
  }
}
