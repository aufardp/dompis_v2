import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import {
  countStatusBuckets,
  isTicketClosed,
  isTicketInWork,
  isTicketOpenLike,
} from '@/app/libs/ticket-utils';
import {
  isB2BJenis,
  isB2CJenis,
  normalizeJenis,
} from '@/app/config/jenis-tiket';
import { getB2BGroupKey } from '@/app/config/b2b-groups';
import { resolveEffectiveFlagging } from '@/app/libs/flagging-manja';
import { getCache, setCache } from '@/lib/cache';

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

type SummaryRow = {
  id_ticket: number;
  customer_type: string | null;
  customer_segment: string | null;
  status_update: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
  ticket_id_gamas: string | null;
  guarantee_status: string | null;
  flagging_manja: string | null;
  booking_date: string | null;
  pending_dompis: string | null;
  workzone: string | null;
};

function cloneCounts(): SummaryCounts {
  return { ...EMPTY_COUNTS };
}

function hasValidGamas(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim();
  return (
    normalized.length > 0 &&
    !['-', '--', 'null', 'undefined', 'n/a', 'na'].includes(
      normalized.toLowerCase(),
    )
  );
}

function incrementCounts(counts: SummaryCounts, row: SummaryRow) {
  counts.total++;

  if (isTicketClosed(row.status_update)) counts.close++;
  else if (isTicketInWork(row.status_update)) counts.assigned++;
  else counts.open++;

  const jenis = normalizeJenis(row.jenis_tiket_2);
  if (jenis === 'reguler' || jenis === 'hvc') counts.customerCount++;
  else if (jenis === 'sqm') counts.sqmCount++;
  else counts.unspecCount++;

  if (
    String(row.guarantee_status ?? '').trim().toLowerCase() === 'guarantee'
  ) {
    counts.ffgCount++;
  }
  if (hasValidGamas(row.ticket_id_gamas)) counts.gamasCount++;

  const flagging = resolveEffectiveFlagging(row.flagging_manja, row.booking_date);
  if (flagging === 'P1') counts.p1Count++;
  if (flagging === 'P+') counts.pPlusCount++;
}

function buildCacheKey(params: URLSearchParams, role: string, userId: number) {
  const filterParams = new URLSearchParams(params);
  if (filterParams.has('_t')) return null;
  filterParams.sort();
  return `dashboard_operations_summary:${role}:${userId}:${filterParams.toString()}`;
}

export async function GET(request: Request) {
  try {
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

    const where = await DailyTicketService.buildDailyTicketWhere(
      user.role,
      user.id_user,
      filters,
    );

    const rows = await prisma.ticket.findMany({
      where,
      select: {
        id_ticket: true,
        customer_type: true,
        customer_segment: true,
        status_update: true,
        jenis_tiket_1: true,
        jenis_tiket_2: true,
        ticket_id_gamas: true,
        guarantee_status: true,
        flagging_manja: true,
        booking_date: true,
        pending_dompis: true,
        workzone: true,
      },
    });

    const statusCounts = countStatusBuckets(rows, (row) => row.status_update);
    const stats = {
      total: statusCounts.total,
      unassigned: statusCounts.open,
      assigned:
        statusCounts.assigned + statusCounts.onProgress + statusCounts.pending,
      close: statusCounts.close,
      b2c: 0,
      b2b: 0,
    };

    const b2cSummary = cloneCounts();
    const b2bSummary = cloneCounts();
    const b2cByType = new Map<string, SummaryCounts>();
    const b2bGroups = new Map<string, SummaryCounts>();
    const serviceAreaMap = new Map<string, SummaryRow[]>();
    const focusCounts = {
      diamond: 0,
      p1: 0,
      gamas: 0,
      ffg: 0,
      carryOver: 0,
    };

    for (const row of rows) {
      const jenis = row.jenis_tiket_2;
      const isB2c = isB2CJenis(jenis);
      const isB2b = isB2BJenis(jenis);
      const flagging = resolveEffectiveFlagging(row.flagging_manja, row.booking_date);

      if (isB2c) {
        stats.b2c++;
        incrementCounts(b2cSummary, row);

        const customerType = String(row.customer_type ?? '').trim().toUpperCase();
        const key = [
          'REGULER',
          'HVC_GOLD',
          'HVC_PLATINUM',
          'HVC_DIAMOND',
        ].includes(customerType)
          ? customerType
          : 'UNCLASSIFIED';

        if (!b2cByType.has(key)) b2cByType.set(key, cloneCounts());
        incrementCounts(b2cByType.get(key)!, row);
      }

      if (isB2b) {
        stats.b2b++;
        incrementCounts(b2bSummary, row);

        const groupKey = getB2BGroupKey(row.jenis_tiket_1);
        if (!b2bGroups.has(groupKey)) b2bGroups.set(groupKey, cloneCounts());
        incrementCounts(b2bGroups.get(groupKey)!, row);
      }

      const workzone = String(row.workzone ?? '').trim();
      if (workzone) {
        if (!serviceAreaMap.has(workzone)) serviceAreaMap.set(workzone, []);
        serviceAreaMap.get(workzone)!.push(row);
      }

      if (String(row.customer_type ?? '').toUpperCase() === 'HVC_DIAMOND') {
        focusCounts.diamond++;
      }
      if (flagging === 'P1') focusCounts.p1++;
      if (hasValidGamas(row.ticket_id_gamas)) focusCounts.gamas++;
      if (
        String(row.guarantee_status ?? '').trim().toLowerCase() ===
        'guarantee'
      ) {
        focusCounts.ffg++;
      }
      if (String(row.pending_dompis ?? '').trim().length > 0) {
        focusCounts.carryOver++;
      }
    }

    const serviceAreas = Array.from(serviceAreaMap.entries())
      .map(([name, areaRows]) => ({
        name,
        total: areaRows.length,
        unassigned: areaRows.filter((row) => isTicketOpenLike(row.status_update))
          .length,
        open: areaRows.filter((row) => isTicketOpenLike(row.status_update))
          .length,
        assigned: areaRows.filter((row) => isTicketInWork(row.status_update))
          .length,
        close: areaRows.filter((row) => isTicketClosed(row.status_update)).length,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const result = {
      stats,
      b2cStats: {
        summary: b2cSummary,
        reguler: b2cByType.get('REGULER') ?? cloneCounts(),
        hvcGold: b2cByType.get('HVC_GOLD') ?? cloneCounts(),
        hvcPlatinum: b2cByType.get('HVC_PLATINUM') ?? cloneCounts(),
        hvcDiamond: b2cByType.get('HVC_DIAMOND') ?? cloneCounts(),
      },
      b2bSummary,
      b2bGroups: Object.fromEntries(b2bGroups.entries()),
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
