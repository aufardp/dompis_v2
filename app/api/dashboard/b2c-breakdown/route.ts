import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { normalizeOperationalBucketKey } from '@/app/config/operational-buckets';
import { parseSearchType } from '@/lib/search-intent';
import { DASHBOARD_CACHE_TTL, getOrSetCacheSwr } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'b2c-breakdown',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);
    const cacheKey = (() => {
      const filterParams = new URLSearchParams(searchParams);
      if (filterParams.has('_t')) return null;
      filterParams.sort();
      return `dashboard_b2c_breakdown:${user.role}:${user.id_user}:${filterParams.toString()}`;
    })();
    const rawBucket = normalizeOperationalBucketKey(searchParams.get('bucket'));
    const filters = {
      search: searchParams.get('search') || undefined,
      searchType: parseSearchType(searchParams.get('searchType')),
      workzone: searchParams.get('workzone') || undefined,
      operationalBucket: rawBucket ? [rawBucket] : undefined,
    };

    const data = cacheKey
      ? await getOrSetCacheSwr(
        cacheKey,
        () => DailyTicketService.getB2CBreakdown(
          user.role,
          user.id_user,
          filters,
        ),
        DASHBOARD_CACHE_TTL,
      )
      : await DailyTicketService.getB2CBreakdown(
        user.role,
        user.id_user,
        filters,
      );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to fetch B2C breakdown');
    const status = getErrorStatus(error, 500);
    return NextResponse.json({ success: false, message }, { status });
  }
}
