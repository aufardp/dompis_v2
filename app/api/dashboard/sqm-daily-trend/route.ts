import { NextRequest, NextResponse } from 'next/server';
import { toZonedTime } from 'date-fns-tz';
import { format, subDays, startOfDay } from 'date-fns';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCacheSwr, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { resolveBranchScope, getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { buildRekapBucketFilterSql } from '@/lib/rekap/rekap-cell-filter';
import { buildTicketRoleScopeSql } from '@/app/libs/tickets/scope';
import { getWorkHourCategory } from '@/app/libs/tickets/ttr-comply';
import { parseWIBDateInput } from '@/app/utils/datetime';
import { logger } from '@/lib/observability/logger';
import { withMaxExecutionTime, isQueryOverloadError } from '@/lib/sql/max-execution-time';

const TIMEZONE = 'Asia/Jakarta';
const TREND_DAYS = 28;

interface TrendTicketRow {
  reported_date: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'dashboard-sqm-daily-trend',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const branchParam = request.nextUrl.searchParams.get('branch');
    const branchSas = await resolveBranchScope(
      decoded.role,
      decoded.id_user,
      branchParam,
    );
    const workzones = isSuperAdmin
      ? null
      : await getWorkzonesForUser(decoded.id_user);

    const requestedWorkzone = String(
      request.nextUrl.searchParams.get('workzone') || '',
    ).trim();
    const selectedWorkzone =
      requestedWorkzone.length > 0 ? requestedWorkzone : undefined;
    if (
      !isSuperAdmin &&
      selectedWorkzone &&
      !(workzones ?? []).includes(selectedWorkzone)
    ) {
      return NextResponse.json(
        { success: false, message: 'Workzone tidak dalam lingkup akses.' },
        { status: 403 },
      );
    }

    if (branchParam && branchSas && branchSas.length === 0 && !isSuperAdmin) {
      return NextResponse.json({ success: true, data: { days: [] } });
    }

    const cacheKey = [
      'dashboard:sqm-daily-trend',
      'v1',
      decoded.role,
      decoded.id_user,
      isSuperAdmin ? 'all' : (workzones ?? []).slice().sort().join(','),
      selectedWorkzone ?? 'all',
      branchParam ?? '',
    ].join(':');

    const data = await getOrSetCacheSwr(
      cacheKey,
      async () => {
        const [baseWhere, baseParams] = buildTicketRoleScopeSql({
          isSuperAdmin,
          workzones,
          selectedWorkzone,
          branchSas,
        });

        const bucketWhere = buildRekapBucketFilterSql('kpi_customer');

        const wibNow = toZonedTime(new Date(), TIMEZONE);
        const startWib = startOfDay(subDays(wibNow, TREND_DAYS - 1));
        const startWibStr = format(startWib, 'yyyy-MM-dd 00:00:00');

        const tickets = await prisma.$queryRawUnsafe<TrendTicketRow[]>(
          withMaxExecutionTime(`SELECT t.reported_date
           FROM ticket t
           WHERE (${baseWhere})
             AND (${bucketWhere})
             AND t.reported_date >= ?`),
          ...baseParams,
          startWibStr,
        );

        const dayMap = new Map<
          string,
          { date: string; open: number; workHour: number; nonWorkHour: number }
        >();
        for (let i = 0; i < TREND_DAYS; i++) {
          const d = subDays(wibNow, TREND_DAYS - 1 - i);
          const key = format(d, 'yyyy-MM-dd');
          dayMap.set(key, { date: key, open: 0, workHour: 0, nonWorkHour: 0 });
        }

        for (const t of tickets) {
          const reported = parseWIBDateInput(t.reported_date);
          if (!reported) continue;
          const dayKey = format(toZonedTime(reported, TIMEZONE), 'yyyy-MM-dd');
          const entry = dayMap.get(dayKey);
          if (!entry) continue;

          entry.open += 1;
          const workHour = getWorkHourCategory(t.reported_date);
          if (workHour === 'work_hour') entry.workHour += 1;
          else if (workHour === 'non_work_hour') entry.nonWorkHour += 1;
        }

        return { days: [...dayMap.values()] };
      },
      DASHBOARD_CACHE_TTL,
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (isQueryOverloadError(error)) {
      logger.warn('SQM daily trend overloaded', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' },
        { status: 503 },
      );
    }
    logger.error('SQM daily trend error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
