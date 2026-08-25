import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { resolveBranchScope, getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { logger } from '@/lib/observability/logger';

interface MonthlyComplyRow {
  month: string;
  total: bigint;
  comply_count: bigint;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'dashboard-ttr-comply',
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

    if (
      branchParam &&
      branchSas &&
      branchSas.length === 0 &&
      !isSuperAdmin
    ) {
      return NextResponse.json({ success: true, data: { months: [] } });
    }

    const cacheKey = [
      'dashboard:ttr-comply',
      'v1',
      decoded.role,
      decoded.id_user,
      isSuperAdmin ? 'all' : (workzones ?? []).slice().sort().join(','),
      selectedWorkzone ?? 'all',
      branchParam ?? '',
    ].join(':');

    const data = await getOrSetCache(
      cacheKey,
      async () => {
        const [whereClause, params] =
          await DailyTicketService.buildDailyTicketSqlParams(
            decoded.role,
            decoded.id_user,
            {
              dept: 'all',
              includeClosed: true,
              workzone: selectedWorkzone,
              branchId: branchParam ? Number(branchParam) : undefined,
            },
          );

        const rows = await prisma.$queryRawUnsafe<MonthlyComplyRow[]>(
          `SELECT
            DATE_FORMAT(closed_at, '%Y-%m') AS month,
            COUNT(*) AS total,
            SUM(ttr_comply_status = 'comply') AS comply_count
          FROM ticket
          WHERE (${whereClause}) AND ttr_comply_status IS NOT NULL
          GROUP BY month
          ORDER BY month ASC`,
          ...params,
        );

        const months = rows.map((row) => {
          const total = Number(row.total);
          const complyCount = Number(row.comply_count);
          return {
            month: row.month,
            total,
            complyCount,
            notComplyCount: total - complyCount,
            complyPercent:
              total > 0 ? Math.round((complyCount / total) * 1000) / 10 : 0,
          };
        });

        return { months };
      },
      DASHBOARD_CACHE_TTL,
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('TTR comply report error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
