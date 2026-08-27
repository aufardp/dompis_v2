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
  const filterParams = new URLSearchParams(params);
  if (filterParams.has('_t')) return null;
  filterParams.sort();
  return `dashboard_top_symptoms:${role}:${userId}:${filterParams.toString()}`;
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'top-symptoms',
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
    const branchParam = searchParams.get('branch');
    const rawDept = toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c', 'netral', 'neutral']);
    const filters = {
      search: searchParams.get('search') || '',
      searchType: parseSearchType(searchParams.get('searchType')),
      dept: rawDept === 'neutral' ? 'netral' : rawDept,
      workzone: searchParams.get('workzone') || undefined,
      branchId: branchParam ? Number(branchParam) : undefined,
      operationalBucket: rawBucket ? [rawBucket] : undefined,
    };

    const cacheKey = buildCacheKey(searchParams, user.role, user.id_user);
    const data = cacheKey
      ? await getOrSetCacheSwr(
          cacheKey,
          () => DailyTicketService.getTopSymptoms(
            user.role,
            user.id_user,
            10,
            filters,
          ),
          DASHBOARD_CACHE_TTL,
        )
      : await DailyTicketService.getTopSymptoms(
          user.role,
          user.id_user,
          10,
          filters,
        );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isQueryOverloadError(error)) {
      logger.warn('top-symptoms overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    const message = getErrorMessage(error, 'Failed to fetch top symptoms');
    const status = getErrorStatus(error, 500);
    return NextResponse.json({ success: false, message }, { status });
  }
}
