import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getOrSetCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 30;

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'ticket-management-overview',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'superadmin',
      'super_admin',
    ]);
    const workzone = new URL(request.url).searchParams.get('workzone') || undefined;

    const cacheKey = `ticket_mgmt_overview:v5:${user.role}:${user.id_user}:${workzone || 'all'}`;

    const data = await getOrSetCache(cacheKey, async () => {
      return DailyTicketService.getTicketManagementOverviewSummary(
        user.role,
        user.id_user,
        workzone,
      );
    }, CACHE_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        ...data,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching ticket management overview'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
