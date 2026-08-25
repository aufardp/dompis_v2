import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getOrSetCacheSwr } from '@/lib/cache';

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
    const { searchParams } = new URL(request.url);
    const workzone = searchParams.get('workzone') || undefined;
    const branchParam = searchParams.get('branch');
    const branchId = branchParam ? Number(branchParam) : undefined;

    const cacheKey = `ticket_mgmt_overview:v6:${user.role}:${user.id_user}:${workzone || 'all'}:${branchId ?? 'all'}`;

    const data = await getOrSetCacheSwr(cacheKey, async () => {
      const summary = await DailyTicketService.getTicketManagementOverviewSummary(
        user.role,
        user.id_user,
        workzone,
        branchId,
      );
      return { ...summary };
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