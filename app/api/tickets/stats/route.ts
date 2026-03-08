import { getCache, setCache } from '@/lib/cache';
import { TicketStatsService } from '@/app/libs/services/ticketStats.service';
import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';

const CACHE_TTL = 120;

export async function GET(request: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const { searchParams } = new URL(request.url);

    const dept = searchParams.get('dept');

  const cacheKey = `stats:dashboard:${dept ?? 'all'}`;

  const cached = await getCache(cacheKey);

  if (cached) {
    return NextResponse.json({
      success: true,
      data: cached,
      cached: true,
    });
  }

  const stats = await TicketStatsService.getDashboardStats({
    dept,
  });

  await setCache(cacheKey, stats, CACHE_TTL);

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
