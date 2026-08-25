import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { resolveBranchScope, getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { getRecurringDisruptionTickets } from '@/app/libs/tickets/recurring-disruption';
import { buildTicketRoleScopeSql } from '@/app/libs/tickets/scope';
import { isGamasTicket } from '@/app/libs/tickets/ttr-comply';
import { logger } from '@/lib/observability/logger';

const TIER_KEYS = ['diamond', 'platinum', 'gold', 'reguler'] as const;
type TierKey = (typeof TIER_KEYS)[number];

const CUSTOMER_TYPE_TO_TIER: Record<string, TierKey> = {
  HVC_DIAMOND: 'diamond',
  HVC_PLATINUM: 'platinum',
  HVC_GOLD: 'gold',
  REGULER: 'reguler',
};

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'dashboard-assurance-guarantee',
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
      return NextResponse.json({ success: true, data: null });
    }

    const cacheKey = [
      'dashboard:assurance-guarantee',
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
        const [baseWhere, baseParams] = buildTicketRoleScopeSql({
          isSuperAdmin,
          workzones,
          selectedWorkzone,
          branchSas,
        });

        const rows = await getRecurringDisruptionTickets(baseWhere, baseParams);

        const tiers: Record<TierKey, { gamas: number; nonGamas: number }> = {
          diamond: { gamas: 0, nonGamas: 0 },
          platinum: { gamas: 0, nonGamas: 0 },
          gold: { gamas: 0, nonGamas: 0 },
          reguler: { gamas: 0, nonGamas: 0 },
        };

        let gamasTotal = 0;
        let nonGamasTotal = 0;

        for (const row of rows) {
          const gamas = isGamasTicket(row.source_ticket);
          if (gamas) gamasTotal += 1;
          else nonGamasTotal += 1;

          const tierKey = row.customer_type
            ? CUSTOMER_TYPE_TO_TIER[row.customer_type.trim().toUpperCase()]
            : undefined;
          if (tierKey) {
            if (gamas) tiers[tierKey].gamas += 1;
            else tiers[tierKey].nonGamas += 1;
          }
        }

        const target = await prisma.kpiTarget.findUnique({
          where: { metricKey: 'assurance_guarantee' },
        });

        return {
          total: rows.length,
          gamasTotal,
          nonGamasTotal,
          tiers,
          target: target ? Number(target.targetValue) : null,
        };
      },
      DASHBOARD_CACHE_TTL,
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Assurance guarantee error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
