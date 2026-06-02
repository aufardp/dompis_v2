import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
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

    const cacheKey = `ticket_mgmt_overview:v4:${user.role}:${user.id_user}:${workzone || 'all'}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const summaryMatrix = await DailyTicketService.getKpiBucketSummaryMatrix(
        user.role,
        user.id_user,
        { workzone },
      );

      const all = summaryMatrix.all;
      const b2c = summaryMatrix.b2c;
      const b2b = summaryMatrix.b2b;

      const totalAll =
        all.kpi_customer.total +
        all.kpi_proactive.total +
        all.non_kpi_unspec.total +
        all.non_technical.total +
        all.sqm_update.total +
        all.obsolete.total;

      const deptB2CTotal =
        b2c.kpi_customer.total +
        b2c.kpi_proactive.total +
        b2c.non_kpi_unspec.total +
        b2c.non_technical.total;
      const deptB2BTotal =
        b2b.kpi_customer.total +
        b2b.kpi_proactive.total +
        b2b.non_kpi_unspec.total +
        b2b.non_technical.total;

      const unassignedTotal =
        all.kpi_customer.open +
        all.kpi_proactive.open +
        all.non_kpi_unspec.open +
        all.non_technical.open +
        all.sqm_update.open +
        all.obsolete.open;

      const assignedTotal =
        all.kpi_customer.assigned +
        all.kpi_proactive.assigned +
        all.non_kpi_unspec.assigned +
        all.non_technical.assigned +
        all.sqm_update.assigned +
        all.obsolete.assigned;

      const closeTotal =
        all.kpi_customer.close +
        all.kpi_proactive.close +
        all.non_kpi_unspec.close +
        all.non_technical.close +
        all.sqm_update.close +
        all.obsolete.close;

      const ffgTotal =
        all.kpi_customer.ffgCount +
        all.kpi_proactive.ffgCount +
        all.non_kpi_unspec.ffgCount +
        all.non_technical.ffgCount +
        all.sqm_update.ffgCount +
        all.obsolete.ffgCount;

      const gamasTotal =
        all.kpi_customer.gamasCount +
        all.kpi_proactive.gamasCount +
        all.non_kpi_unspec.gamasCount +
        all.non_technical.gamasCount +
        all.sqm_update.gamasCount +
        all.obsolete.gamasCount;

      const p1Total =
        all.kpi_customer.p1Count +
        all.kpi_proactive.p1Count +
        all.non_kpi_unspec.p1Count +
        all.non_technical.p1Count +
        all.sqm_update.p1Count +
        all.obsolete.p1Count;

      const pPlusTotal =
        all.kpi_customer.pPlusCount +
        all.kpi_proactive.pPlusCount +
        all.non_kpi_unspec.pPlusCount +
        all.non_technical.pPlusCount +
        all.sqm_update.pPlusCount +
        all.obsolete.pPlusCount;

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
          kpiCustomer: all.kpi_customer,
          kpiProactive: all.kpi_proactive,
          nonKpiUnspec: all.non_kpi_unspec,
          nonTechnical: all.non_technical,
          sqmUpdate: all.sqm_update,
          obsolete: all.obsolete,
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
