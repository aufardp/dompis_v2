import { NextResponse } from 'next/server';
import db from '@/app/libs/db';
import { protectApi } from '@/app/libs/protectApi';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'teknisi']);

    const [rows]: any = await db.query(`
      SELECT DISTINCT 
        t.WORKZONE AS workzone
      FROM ticket t
      WHERE t.WORKZONE IS NOT NULL AND t.WORKZONE != ''
      ORDER BY t.WORKZONE ASC
    `);

    const options = rows.map((row: any) => ({
      value: row.workzone,
      label: row.workzone,
    }));

    return NextResponse.json({
      success: true,
      data: options,
    });
  } catch (error: any) {
    console.error('Workzone fetch error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
