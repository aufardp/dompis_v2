import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getOrSetCacheSwr, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { resolveBranchScope, getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import {
  getRecurringDisruptionServiceGroups,
  getRecurringDisruptionTicketsByServiceNo,
} from '@/app/libs/tickets/recurring-disruption';
import { buildTicketRoleScopeSql } from '@/app/libs/tickets/scope';
import { toWibString } from '@/lib/timezone';
import { logger } from '@/lib/observability/logger';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';

const TIER_KEYS = ['diamond', 'platinum', 'gold', 'reguler'] as const;
type TierKey = (typeof TIER_KEYS)[number];

const TIER_TO_CUSTOMER_TYPES: Record<TierKey, string[]> = {
  diamond: ['HVC_DIAMOND'],
  platinum: ['HVC_PLATINUM'],
  gold: ['HVC_GOLD'],
  reguler: ['REGULER'],
};

const GAMAS_VALUES = ['all', 'gamas', 'non-gamas'] as const;
type GamasFilter = (typeof GAMAS_VALUES)[number];

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'dashboard-assurance-guarantee-tickets',
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
      return NextResponse.json({
        success: true,
        data: {
          meta: {
            tier: 'all',
            gamas: 'all',
            q: null,
            page: 1,
            limit: 20,
            total: 0,
            hasMore: false,
          },
          groups: [],
        },
      });
    }

    const tierParam = String(
      request.nextUrl.searchParams.get('tier') ?? 'all',
    ).trim();
    const tier: TierKey | 'all' = (TIER_KEYS as readonly string[]).includes(
      tierParam,
    )
      ? (tierParam as TierKey)
      : 'all';

    const gamasParam = String(
      request.nextUrl.searchParams.get('gamas') ?? 'all',
    ).trim();
    const gamas: GamasFilter = (
      GAMAS_VALUES as readonly string[]
    ).includes(gamasParam)
      ? (gamasParam as GamasFilter)
      : 'all';

    const q = String(request.nextUrl.searchParams.get('q') ?? '').trim();
    const page = Math.max(
      1,
      Number(request.nextUrl.searchParams.get('page') ?? '1') || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '20') || 20),
    );

    const cacheKey = [
      'dashboard:assurance-guarantee:tickets',
      'v2',
      decoded.role,
      decoded.id_user,
      isSuperAdmin ? 'all' : (workzones ?? []).slice().sort().join(','),
      selectedWorkzone ?? 'all',
      branchParam ?? '',
      tier,
      gamas,
      q,
      page,
      limit,
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

        const filterOptions = {
          customerTypes: tier === 'all' ? null : TIER_TO_CUSTOMER_TYPES[tier],
          gamas,
          search: q || undefined,
        };

        const { groups, total } = await getRecurringDisruptionServiceGroups(
          baseWhere,
          baseParams,
          { ...filterOptions, page, limit },
        );

        const serviceNos = groups
          .map((g) => g.service_no)
          .filter((sn): sn is string => !!sn);
        const ticketRows = await getRecurringDisruptionTicketsByServiceNo(
          baseWhere,
          baseParams,
          serviceNos,
          filterOptions,
        );

        const ticketsByServiceNo = new Map<
          string,
          typeof ticketRows
        >();
        for (const row of ticketRows) {
          if (!row.service_no) continue;
          const list = ticketsByServiceNo.get(row.service_no) ?? [];
          list.push(row);
          ticketsByServiceNo.set(row.service_no, list);
        }

        const offset = (page - 1) * limit;

        return {
          meta: {
            tier,
            gamas,
            q: q || null,
            page,
            limit,
            total,
            hasMore: offset + groups.length < total,
          },
          groups: groups.map((g) => ({
            serviceNo: g.service_no,
            occurrenceCount: g.occurrence_count,
            tickets: (ticketsByServiceNo.get(g.service_no) ?? []).map((row) => ({
              idTicket: row.id_ticket,
              ticket: row.incident,
              customerType: row.customer_type,
              sourceTicket: row.source_ticket,
              status: row.status,
              reportedDate: toWibString(row.reported_date),
              closedAt: toWibString(row.closed_at),
              rca: row.rca,
              subRca: row.sub_rca,
              technicianName: row.technician_name,
            })),
          })),
        };
      },
      Math.max(DASHBOARD_CACHE_TTL, 90),
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (isQueryOverloadError(error)) {
      logger.warn('assurance-guarantee/tickets overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    logger.error('Assurance guarantee tickets error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
