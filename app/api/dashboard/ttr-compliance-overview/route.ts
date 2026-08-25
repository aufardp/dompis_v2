import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { resolveBranchScope, getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import {
  getTodayWibRange,
  getWeekWibRange,
  getMonthWibRange,
} from '@/lib/timezone';
import { buildTicketRoleScopeSql } from '@/app/libs/tickets/scope';
import {
  isGamasTicket,
  isManjaP1Ticket,
  computeManjaCompliance,
  computeSqmWorkHourCompliance,
} from '@/app/libs/tickets/ttr-comply';
import { computeMttrSeconds, formatMttr } from '@/app/libs/tickets/mttr';
import { logger } from '@/lib/observability/logger';

type Period = 'today' | 'week' | 'month';

const TIER_KEYS = ['diamond', 'platinum', 'gold', 'reguler'] as const;
type TierKey = (typeof TIER_KEYS)[number];

const CUSTOMER_TYPE_TO_TIER: Record<string, TierKey> = {
  HVC_DIAMOND: 'diamond',
  HVC_PLATINUM: 'platinum',
  HVC_GOLD: 'gold',
  REGULER: 'reguler',
};

interface ClosedTicketRow {
  status: string | null;
  closed_at: Date | null;
  reported_date: string | null;
  booking_date: string | null;
  customer_segment: string | null;
  customer_type: string | null;
  source_ticket: string | null;
  flagging_manja: string | null;
  jenis_tiket_1: string | null;
  ttr_comply_status: string | null;
}

interface SegCompliance {
  totalClose: number;
  comply: number;
  notComply: number;
  gamas: { comply: number; notComply: number };
  nonGamas: { comply: number; notComply: number };
}

function emptySegCompliance(): SegCompliance {
  return {
    totalClose: 0,
    comply: 0,
    notComply: 0,
    gamas: { comply: 0, notComply: 0 },
    nonGamas: { comply: 0, notComply: 0 },
  };
}

function tally(seg: SegCompliance, status: 'comply' | 'not_comply', gamas: boolean) {
  seg.totalClose += 1;
  if (status === 'comply') {
    seg.comply += 1;
    (gamas ? seg.gamas : seg.nonGamas).comply += 1;
  } else {
    seg.notComply += 1;
    (gamas ? seg.gamas : seg.nonGamas).notComply += 1;
  }
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'dashboard-ttr-compliance-overview',
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

    const requestedPeriod = String(
      request.nextUrl.searchParams.get('period') ?? 'today',
    ).trim();
    const period: Period =
      requestedPeriod === 'week' || requestedPeriod === 'month'
        ? requestedPeriod
        : 'today';

    const cacheKey = [
      'dashboard:ttr-compliance-overview',
      'v1',
      period,
      decoded.role,
      decoded.id_user,
      isSuperAdmin ? 'all' : (workzones ?? []).slice().sort().join(','),
      selectedWorkzone ?? 'all',
      branchParam ?? '',
    ].join(':');

    const data = await getOrSetCache(
      cacheKey,
      async () => {
        const range =
          period === 'week'
            ? getWeekWibRange()
            : period === 'month'
              ? getMonthWibRange()
              : getTodayWibRange();

        const [baseWhere, baseParams] = buildTicketRoleScopeSql({
          isSuperAdmin,
          workzones,
          selectedWorkzone,
          branchSas,
        });

        const tickets = await prisma.$queryRawUnsafe<ClosedTicketRow[]>(
          `SELECT
            status, closed_at, reported_date, booking_date,
            customer_segment, customer_type, source_ticket,
            flagging_manja, jenis_tiket_1, ttr_comply_status
          FROM ticket
          WHERE (${baseWhere})
            AND closed_at >= ? AND closed_at <= ?`,
          ...baseParams,
          range.start,
          range.end,
        );

        // --- MTTR (semua tiket closed di periode ini) ---
        const mttrSeconds = computeMttrSeconds(
          tickets.map((t) => ({ reportedDate: t.reported_date, closedAt: t.closed_at })),
        );

        // --- Comply / Not Comply keseluruhan (dari ttr_comply_status tersimpan) ---
        let complyTotal = 0;
        let notComplyTotal = 0;

        // --- 4 tier customer-type ---
        const tiers: Record<TierKey, SegCompliance> = {
          diamond: emptySegCompliance(),
          platinum: emptySegCompliance(),
          gold: emptySegCompliance(),
          reguler: emptySegCompliance(),
        };

        // --- Tier MANJA 3 jam (P1) ---
        const manja = emptySegCompliance();

        // --- WorkHour / Non-WorkHour + TTR Comply SQM 4H ---
        let workHourCount = 0;
        let nonWorkHourCount = 0;
        const sqmWorkHour = emptySegCompliance();

        for (const t of tickets) {
          const gamas = isGamasTicket(t.source_ticket);

          if (t.ttr_comply_status === 'comply' || t.ttr_comply_status === 'not_comply') {
            complyTotal += t.ttr_comply_status === 'comply' ? 1 : 0;
            notComplyTotal += t.ttr_comply_status === 'not_comply' ? 1 : 0;

            const tierKey = t.customer_type
              ? CUSTOMER_TYPE_TO_TIER[t.customer_type.trim().toUpperCase()]
              : undefined;
            if (tierKey) {
              tally(tiers[tierKey], t.ttr_comply_status, gamas);
            }
          }

          if (isManjaP1Ticket(t.flagging_manja)) {
            const manjaResult = computeManjaCompliance({
              status: t.status,
              closedAt: t.closed_at,
              bookingDate: t.booking_date,
              flaggingManja: t.flagging_manja,
            });
            if (manjaResult.status) tally(manja, manjaResult.status, gamas);
          }

          const isSqm =
            (t.source_ticket ?? '').trim().toLowerCase() === 'proactive' &&
            (t.jenis_tiket_1 ?? '').toLowerCase().includes('sqm');
          if (isSqm) {
            const sqmResult = computeSqmWorkHourCompliance({
              status: t.status,
              closedAt: t.closed_at,
              reportedDate: t.reported_date,
            });
            if (sqmResult.workHour === 'work_hour') workHourCount += 1;
            else if (sqmResult.workHour === 'non_work_hour') nonWorkHourCount += 1;
            if (sqmResult.status) tally(sqmWorkHour, sqmResult.status, gamas);
          }
        }

        const targets = await prisma.kpiTarget.findMany();
        const targetMap = new Map(
          targets.map((t) => [t.metricKey, Number(t.targetValue)]),
        );

        const withPercent = (seg: SegCompliance, targetKey: string) => {
          const percent =
            seg.totalClose > 0
              ? Math.round((seg.comply / seg.totalClose) * 1000) / 10
              : 0;
          return {
            ...seg,
            percent,
            target: targetMap.get(targetKey) ?? null,
            achievement:
              targetMap.has(targetKey) && targetMap.get(targetKey)! > 0
                ? Math.round((percent / targetMap.get(targetKey)!) * 1000) / 10
                : null,
          };
        };

        return {
          period,
          mttrSeconds,
          mttrFormatted: formatMttr(mttrSeconds),
          complyTotal,
          notComplyTotal,
          workHourCount,
          nonWorkHourCount,
          sqmWorkHourCompliance: withPercent(sqmWorkHour, 'ttr_comply_sqm_4h'),
          tiers: {
            manja: withPercent(manja, 'ttr_comply_manja'),
            diamond: withPercent(tiers.diamond, 'ttr_comply_diamond'),
            platinum: withPercent(tiers.platinum, 'ttr_comply_platinum'),
            gold: withPercent(tiers.gold, 'ttr_comply_gold'),
            reguler: withPercent(tiers.reguler, 'ttr_comply_reguler'),
          },
        };
      },
      DASHBOARD_CACHE_TTL,
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('TTR compliance overview error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
