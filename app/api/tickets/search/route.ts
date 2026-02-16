import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(req: Request) {
  try {
    const user = await protectApi(['admin', 'teknisi']);

    const { searchParams } = new URL(req.url);
    const incident = searchParams.get('incident');

    if (!incident) {
      return NextResponse.json(
        { success: false, message: 'Incident parameter is required' },
        { status: 400 },
      );
    }

    const result = await TicketService.search(
      incident,
      user.role,
      user.id_user,
    );

    return NextResponse.json({
      success: true,
      total: result.length,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }
}
