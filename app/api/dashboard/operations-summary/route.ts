import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import {
  isTicketClosed,
  isTicketInWork,
} from '@/app/libs/ticket-utils';
import {
  normalizeJenis,
  getB2BJenisWhereClause,
  getB2CJenisWhereClause,
} from '@/app/config/jenis-tiket';
import { getB2BGroupKey } from '@/app/config/b2b-groups';
import { getCache, setCache } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 30;
const EMPTY_COUNTS = {
  total: 0,
  open: 0,
  assigned: 0,
  close: 0,
  regulerCount: 0,
  sqmCount: 0,
  unspecCount: 0,
  customerCount: 0,
  ffgCount: 0,
  gamasCount: 0,
  p1Count: 0,
  pPlusCount: 0,
};

type SummaryCounts = typeof EMPTY_COUNTS;

function cloneCounts(): SummaryCounts {
  return { ...EMPTY_COUNTS };
}

function buildCacheKey(params: URLSearchParams, role: string, userId: number) {
  const filterParams = new URLSearchParams(params);
  if (filterParams.has('_t')) return null;
  filterParams.sort();
  return `dashboard_operations_summary:${role}:${userId}:${filterParams.toString()}`;
}

function withWhere(
  baseWhere: Prisma.ticketWhereInput,
  ...clauses: Prisma.ticketWhereInput[]
) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) return baseWhere;
  return {
    AND: [baseWhere, ...activeClauses],
  };
}

const validGamasWhere = {
  AND: [
    { ticket_id_gamas: { not: null } },
    { ticket_id_gamas: { not: '' } },
    { ticket_id_gamas: { not: '-' } },
    { ticket_id_gamas: { not: '--' } },
    { ticket_id_gamas: { not: 'null' } },
    { ticket_id_gamas: { not: 'undefined' } },
    { ticket_id_gamas: { not: 'n/a' } },
    { ticket_id_gamas: { not: 'na' } },
  ],
};

const carryOverWhere = {
  AND: [
    { pending_dompis: { not: null } },
    { pending_dompis: { not: '' } },
  ],
};

async function countStatusSummary(
  where: Prisma.ticketWhereInput,
): Promise<Pick<SummaryCounts, 'total' | 'open' | 'assigned' | 'close'>> {
  const groups = await prisma.ticket.groupBy({
    by: ['status_update'],
    where,
    _count: { _all: true },
  });

  const result = { total: 0, open: 0, assigned: 0, close: 0 };
  for (const group of groups) {
    const count = group._count._all;
    result.total += count;
    if (isTicketClosed(group.status_update)) result.close += count;
    else if (isTicketInWork(group.status_update)) result.assigned += count;
    else result.open += count;
  }

  return result;
}

async function countTicketSummary(
  where: Prisma.ticketWhereInput,
): Promise<SummaryCounts> {
  const [
    statusCounts,
    jenisGroups,
    ffgCount,
    gamasCount,
    p1Count,
    pPlusCount,
  ] = await Promise.all([
    countStatusSummary(where),
    prisma.ticket.groupBy({
      by: ['jenis_tiket_2'],
      where,
      _count: { _all: true },
    }),
    prisma.ticket.count({
      where: withWhere(where, { guarantee_status: 'guarantee' }),
    }),
    prisma.ticket.count({
      where: withWhere(where, validGamasWhere),
    }),
    prisma.ticket.count({
      where: withWhere(where, { flagging_manja: 'P1' }),
    }),
    prisma.ticket.count({
      where: withWhere(where, { flagging_manja: 'P+' }),
    }),
  ]);

  const result: SummaryCounts = {
    ...cloneCounts(),
    ...statusCounts,
    ffgCount,
    gamasCount,
    p1Count,
    pPlusCount,
  };

  for (const group of jenisGroups) {
    const jenis = normalizeJenis(group.jenis_tiket_2);
    const count = group._count._all;
    if (jenis === 'reguler' || jenis === 'hvc') result.customerCount += count;
    else if (jenis === 'sqm') result.sqmCount += count;
    else result.unspecCount += count;
  }

  return result;
}

function mergeGroupSummary(
  target: SummaryCounts,
  statusUpdate: string | null,
  count: number,
) {
  target.total += count;
  if (isTicketClosed(statusUpdate)) target.close += count;
  else if (isTicketInWork(statusUpdate)) target.assigned += count;
  else target.open += count;
}

async function buildB2BGroups(where: Prisma.ticketWhereInput) {
  const b2bWhere = withWhere(
    where,
    getB2BJenisWhereClause() as Prisma.ticketWhereInput,
  );
  const [statusGroups, ffgGroups, gamasGroups, p1Groups, pPlusGroups] =
    await Promise.all([
      prisma.ticket.groupBy({
        by: ['jenis_tiket_1', 'status_update'],
        where: b2bWhere,
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ['jenis_tiket_1'],
        where: withWhere(b2bWhere, { guarantee_status: 'guarantee' }),
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ['jenis_tiket_1'],
        where: withWhere(b2bWhere, validGamasWhere),
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ['jenis_tiket_1'],
        where: withWhere(b2bWhere, { flagging_manja: 'P1' }),
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ['jenis_tiket_1'],
        where: withWhere(b2bWhere, { flagging_manja: 'P+' }),
        _count: { _all: true },
      }),
    ]);

  const groups = new Map<string, SummaryCounts>();
  const getGroup = (jenisTiket1: string | null) => {
    const key = getB2BGroupKey(jenisTiket1);
    if (!groups.has(key)) groups.set(key, cloneCounts());
    return groups.get(key)!;
  };

  for (const group of statusGroups) {
    mergeGroupSummary(
      getGroup(group.jenis_tiket_1),
      group.status_update,
      group._count._all,
    );
  }

  for (const group of ffgGroups) getGroup(group.jenis_tiket_1).ffgCount += group._count._all;
  for (const group of gamasGroups) getGroup(group.jenis_tiket_1).gamasCount += group._count._all;
  for (const group of p1Groups) getGroup(group.jenis_tiket_1).p1Count += group._count._all;
  for (const group of pPlusGroups) getGroup(group.jenis_tiket_1).pPlusCount += group._count._all;

  return Object.fromEntries(groups.entries());
}

async function buildServiceAreas(where: Prisma.ticketWhereInput) {
  const groups = await prisma.ticket.groupBy({
    by: ['workzone', 'status_update'],
    where,
    _count: { _all: true },
  });

  const areaMap = new Map<
    string,
    { name: string; total: number; unassigned: number; open: number; assigned: number; close: number }
  >();

  for (const group of groups) {
    const name = String(group.workzone ?? '').trim();
    if (!name) continue;
    if (!areaMap.has(name)) {
      areaMap.set(name, {
        name,
        total: 0,
        unassigned: 0,
        open: 0,
        assigned: 0,
        close: 0,
      });
    }

    const row = areaMap.get(name)!;
    const count = group._count._all;
    row.total += count;
    if (isTicketClosed(group.status_update)) row.close += count;
    else if (isTicketInWork(group.status_update)) row.assigned += count;
    else {
      row.open += count;
      row.unassigned += count;
    }
  }

  return Array.from(areaMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'operations-summary',
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
    const filters = {
      search: searchParams.get('search') || '',
      dept: searchParams.get('dept') || undefined,
      workzone: searchParams.get('workzone') || undefined,
      ticketType:
        searchParams.get('ticketType') ||
        searchParams.get('jenisTiket') ||
        undefined,
      statusUpdate:
        searchParams.get('statusUpdate') ||
        searchParams.get('status') ||
        undefined,
    };

    const cacheKey = buildCacheKey(searchParams, user.role, user.id_user);
    if (cacheKey) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
          cached: true,
        });
      }
    }

    const where = (await DailyTicketService.buildDailyTicketWhere(
      user.role,
      user.id_user,
      filters,
    )) as Prisma.ticketWhereInput;

    const b2cWhere = withWhere(
      where,
      getB2CJenisWhereClause() as Prisma.ticketWhereInput,
    );
    const b2bWhere = withWhere(
      where,
      getB2BJenisWhereClause() as Prisma.ticketWhereInput,
    );

    const [
      statusCounts,
      b2cSummary,
      b2bSummary,
      reguler,
      hvcGold,
      hvcPlatinum,
      hvcDiamond,
      b2bGroups,
      serviceAreas,
      diamondCount,
      p1Count,
      gamasCount,
      ffgCount,
      carryOverCount,
    ] = await Promise.all([
      countStatusSummary(where),
      countTicketSummary(b2cWhere),
      countTicketSummary(b2bWhere),
      countTicketSummary(withWhere(b2cWhere, { customer_type: 'REGULER' })),
      countTicketSummary(withWhere(b2cWhere, { customer_type: 'HVC_GOLD' })),
      countTicketSummary(withWhere(b2cWhere, { customer_type: 'HVC_PLATINUM' })),
      countTicketSummary(withWhere(b2cWhere, { customer_type: 'HVC_DIAMOND' })),
      buildB2BGroups(where),
      buildServiceAreas(where),
      prisma.ticket.count({ where: withWhere(where, { customer_type: 'HVC_DIAMOND' }) }),
      prisma.ticket.count({ where: withWhere(where, { flagging_manja: 'P1' }) }),
      prisma.ticket.count({ where: withWhere(where, validGamasWhere) }),
      prisma.ticket.count({ where: withWhere(where, { guarantee_status: 'guarantee' }) }),
      prisma.ticket.count({ where: withWhere(where, carryOverWhere) }),
    ]);

    const stats = {
      total: statusCounts.total,
      unassigned: statusCounts.open,
      assigned: statusCounts.assigned,
      close: statusCounts.close,
      b2c: b2cSummary.total,
      b2b: b2bSummary.total,
    };

    const focusCounts = {
      diamond: diamondCount,
      p1: p1Count,
      gamas: gamasCount,
      ffg: ffgCount,
      carryOver: carryOverCount,
    };

    const result = {
      stats,
      b2cStats: {
        summary: b2cSummary,
        reguler,
        hvcGold,
        hvcPlatinum,
        hvcDiamond,
      },
      b2bSummary,
      b2bGroups,
      serviceAreas,
      focusCounts,
      generatedAt: new Date().toISOString(),
    };

    if (cacheKey) {
      await setCache(cacheKey, result, CACHE_TTL_SECONDS);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching operations summary'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
