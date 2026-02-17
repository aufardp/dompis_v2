import { protectApi } from '@/app/libs/protectApi';
import { TicketService } from '@/app/libs/services/tickets.service';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
    ]);

    const stats = await TicketService.getStats(user.role, user.id_user);

    return NextResponse.json({
      success: true,
      data: {
        total: Number(stats?.total || 0),
        unassigned: Number(stats?.unassigned || 0),
        open: Number(stats?.open || 0),
        assigned: Number(stats?.assigned || 0),
        closed: Number(stats?.closed || 0),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load stats';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
