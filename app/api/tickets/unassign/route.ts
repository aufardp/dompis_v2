import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import db from '@/app/libs/db';

export async function POST(req: Request) {
  try {
    await protectApi(['admin']);

    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE ticket SET teknisi_user_id = NULL, hasil_visit = 'open' WHERE id_ticket = ?`,
        [ticketId],
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Ticket unassigned successfully',
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to unassign ticket' },
      { status: 400 },
    );
  }
}
