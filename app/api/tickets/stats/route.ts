import { getOrSetCache } from '@/lib/cache';
import { TicketStatsService } from '@/app/libs/services/ticketStats.service';
import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';

const CACHE_TTL = 120;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const dept = searchParams.get('dept');

    const stats = await getOrSetCache(
      `stats:dashboard:${dept ?? 'all'}`,
      () => TicketStatsService.getDashboardStats({ dept }),
      CACHE_TTL,
    );

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Server Error' },
      { status: error?.status || 500 },
    );
  }
}
