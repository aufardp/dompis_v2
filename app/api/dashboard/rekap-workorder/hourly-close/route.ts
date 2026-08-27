import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseSearchType } from '@/lib/search-intent';
import { toEnumValue } from '@/lib/http-query';
import { normalizeOperationalBucketKey } from '@/app/config/operational-buckets';
import { getOrSetCacheSwr, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { logger } from '@/lib/observability/logger';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';

export const dynamic = 'force-dynamic';

function buildCacheKey(params: URLSearchParams, role: string, userId: number) {
  const bucket = normalizeOperationalBucketKey(params.get('bucket'));
  const workzone = String(params.get('workzone') || '').trim();
  const branch = String(params.get('branch') || '').trim();
  const filterParams = new URLSearchParams();

  if (bucket) filterParams.set('bucket', bucket);
  if (workzone) filterParams.set('workzone', workzone);
  if (branch) filterParams.set('branch', branch);

  return `dashboard_hourly_close:${role}:${userId}:${filterParams.toString()}`;
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'rekap-workorder-hourly-close',
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
    const rawBucket = normalizeOperationalBucketKey(searchParams.get('bucket'));
    const branchParam = searchParams.get('branch') || '';
    const rawDept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c', 'netral', 'neutral']);
    const filters = {
      search: searchParams.get('search') || '',
      searchType: parseSearchType(searchParams.get('searchType')),
      dept: rawDept === 'neutral' ? 'netral' : rawDept,
      workzone: searchParams.get('workzone') || undefined,
      branchId: branchParam ? Number(branchParam) : undefined,
      operationalBucket: rawBucket ? [rawBucket] : undefined,
      includeClosed: true,
    };

    const cacheKey = buildCacheKey(searchParams, user.role, user.id_user);
    const data = cacheKey
      ? await getOrSetCacheSwr(
          cacheKey,
          () =>
            DailyTicketService.getHourlyCloseCounts(
              user.role,
              user.id_user,
              filters,
            ),
          DASHBOARD_CACHE_TTL,
        )
      : await DailyTicketService.getHourlyCloseCounts(
          user.role,
          user.id_user,
          filters,
        );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isQueryOverloadError(error)) {
      logger.warn('rekap-workorder/hourly-close overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    const message = getErrorMessage(
      error,
      'Failed to fetch hourly close counts',
    );
    const status = getErrorStatus(error, 500);
    return NextResponse.json({ success: false, message }, { status });
  }
}
