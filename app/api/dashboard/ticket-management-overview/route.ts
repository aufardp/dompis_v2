import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getOrSetCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 30;

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'ticket-management-overview',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'superadmin',
      'super_admin',
    ]);
    const workzone = new URL(request.url).searchParams.get('workzone') || undefined;

    const cacheKey = `ticket_mgmt_overview:v5:${user.role}:${user.id_user}:${workzone || 'all'}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const bucketDefs = [
        { key: 'kpiCustomer', bucket: 'kpi_customer' as const },
        { key: 'kpiProactive', bucket: 'kpi_proactive' as const },
        { key: 'nonKpiUnspec', bucket: 'non_kpi_unspec' as const },
        { key: 'nonTechnical', bucket: 'non_technical' as const },
        { key: 'sqmUpdate', bucket: 'sqm_update' as const },
        { key: 'obsolete', bucket: 'obsolete' as const },
      ];

      const closeFilters = {
        ticketStatus: CLOSE_STATUS_VALUES,
        includeClosed: true,
      } as const;

      const [allSummaries, b2cSummaries, b2bSummaries, allCloseSummaries] =
        await Promise.all([
        Promise.all(
          bucketDefs.map(async ({ bucket }) => [
            bucket,
            await DailyTicketService.getDailyTicketSummary(
              user.role,
              user.id_user,
              { workzone, operationalBucket: [bucket] },
            ),
          ] as const),
        ),
        Promise.all(
          bucketDefs.map(async ({ bucket }) => [
            bucket,
            await DailyTicketService.getDailyTicketSummary(
              user.role,
              user.id_user,
              { workzone, dept: 'b2c', operationalBucket: [bucket] },
            ),
          ] as const),
        ),
        Promise.all(
          bucketDefs.map(async ({ bucket }) => [
            bucket,
            await DailyTicketService.getDailyTicketSummary(
              user.role,
              user.id_user,
              { workzone, dept: 'b2b', operationalBucket: [bucket] },
            ),
          ] as const),
        ),
        Promise.all(
          bucketDefs.map(async ({ bucket }) => [
            bucket,
            await DailyTicketService.getDailyTicketSummary(
              user.role,
              user.id_user,
              { workzone, operationalBucket: [bucket], ...closeFilters },
            ),
          ] as const),
        ),
      ]);

      const all = Object.fromEntries(allSummaries) as Record<
        (typeof bucketDefs)[number]['bucket'],
        Awaited<ReturnType<typeof DailyTicketService.getDailyTicketSummary>>
      >;
      const b2c = Object.fromEntries(b2cSummaries) as Record<
        (typeof bucketDefs)[number]['bucket'],
        Awaited<ReturnType<typeof DailyTicketService.getDailyTicketSummary>>
      >;
      const b2b = Object.fromEntries(b2bSummaries) as Record<
        (typeof bucketDefs)[number]['bucket'],
        Awaited<ReturnType<typeof DailyTicketService.getDailyTicketSummary>>
      >;
      const closeMap = Object.fromEntries(allCloseSummaries) as Record<
        (typeof bucketDefs)[number]['bucket'],
        Awaited<ReturnType<typeof DailyTicketService.getDailyTicketSummary>>
      >;

      const totalAll = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.total ?? 0),
        0,
      );

      const deptB2CTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(b2c[bucket]?.total ?? 0),
        0,
      );
      const deptB2BTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(b2b[bucket]?.total ?? 0),
        0,
      );

      const unassignedTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.open ?? 0),
        0,
      );

      const assignedTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.assigned ?? 0),
        0,
      );

      const closeTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(closeMap[bucket]?.close ?? 0),
        0,
      );

      const ffgTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.ffgCount ?? 0),
        0,
      );

      const gamasTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.gamasCount ?? 0),
        0,
      );

      const p1Total = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.p1Count ?? 0),
        0,
      );

      const pPlusTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + Number(all[bucket]?.pPlusCount ?? 0),
        0,
      );

      return {
        totals: {
          total: totalAll,
          b2c: deptB2CTotal,
          b2b: deptB2BTotal,
          unassigned: unassignedTotal,
          assigned: assignedTotal,
          close: closeTotal,
          ffgCount: ffgTotal,
          gamasCount: gamasTotal,
          p1Count: p1Total,
          pPlusCount: pPlusTotal,
        },
        cards: {
          kpiCustomer: { ...all.kpi_customer, close: closeMap.kpi_customer.close },
          kpiProactive: { ...all.kpi_proactive, close: closeMap.kpi_proactive.close },
          nonKpiUnspec: { ...all.non_kpi_unspec, close: closeMap.non_kpi_unspec.close },
          nonTechnical: { ...all.non_technical, close: closeMap.non_technical.close },
          sqmUpdate: { ...all.sqm_update, close: closeMap.sqm_update.close },
          obsolete: { ...all.obsolete, close: closeMap.obsolete.close },
        },
      };
    }, CACHE_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        ...data,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching ticket management overview'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
