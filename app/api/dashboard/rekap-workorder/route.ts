import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getOrSetCacheSwr } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getWorkzonesForUser, resolveBranchScope } from '@/app/helpers/ticket.helpers';
import { toWibDateString } from '@/lib/timezone';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';
import { type KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { logger } from '@/lib/observability/logger';
import type { LegacyCustomerBucketRow, RekapTicketRow } from './types';
import {
  buildBucketBreakdownFromRekapRows,
  buildBucketSummaryFromRows,
  filterRekapRowsByBucket,
  buildSelectedBucketSummary,
  buildRekapResponse,
} from './aggregate';
import {
  REKAP_WORKORDER_CACHE_VERSION,
  getCustomerRekapTicketsSafe,
  getFilteredRekapTickets,
  getRekapTeknisiRows,
  getRekapTeknisiRegistered,
  getRekapAging,
  getLegacyCustomerBucketRows,
  getCustomerSqmOverlayTickets,
  getCustomerGamasOverlayTickets,
  getRekapExpectedServiceAreas,
} from './queries';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'rekap-workorder',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';
    const requestedWorkzone = String(
      request.nextUrl.searchParams.get('workzone') || '',
    ).trim();

    const workzones = isSuperAdmin
      ? null
      : await getWorkzonesForUser(decoded.id_user);
    const today = toWibDateString(new Date())!;
    const requestedBucket = request.nextUrl.searchParams.get('bucket') ?? 'all';
    const bucket: KpiBucketKey =
      requestedBucket === 'kpi_customer' ||
      requestedBucket === 'kpi_proactive' ||
      requestedBucket === 'non_kpi_unspec' ||
      requestedBucket === 'non_technical' ||
      requestedBucket === 'sqm_update' ||
      requestedBucket === 'obsolete'
        ? requestedBucket
        : 'all';
    const selectedWorkzone =
      requestedWorkzone.length > 0 ? requestedWorkzone : undefined;

    const branchParam = request.nextUrl.searchParams.get('branch');
    const branchSas = await resolveBranchScope(
      decoded.role,
      decoded.id_user,
      branchParam,
    );

    if (
      branchParam &&
      branchSas &&
      branchSas.length === 0 &&
      !isSuperAdmin
    ) {
      return NextResponse.json({
        rows: [],
        totals: {},
        timestamp: new Date().toISOString(),
        syncDate: today,
        title: 'REKAP WORKORDER ASSURANCE',
        subtitle: '',
        kpiSummary: {
          total: 0,
          kpiCustomer: 0,
          kpiProactive: 0,
          nonKpiUnspec: 0,
          nonTechnical: 0,
          sqmUpdate: 0,
          obsolete: 0,
        },
        bucketSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
        },
        workboardSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        selectedBucket: bucket,
      });
    }

    if (
      !isSuperAdmin &&
      selectedWorkzone &&
      !(workzones ?? []).includes(selectedWorkzone)
    ) {
      return NextResponse.json({
        rows: [],
        totals: {},
        timestamp: new Date().toISOString(),
        syncDate: today,
        title: 'REKAP WORKORDER ASSURANCE',
        subtitle: '',
        kpiSummary: {
          total: 0,
          kpiCustomer: 0,
          kpiProactive: 0,
          nonKpiUnspec: 0,
          nonTechnical: 0,
          sqmUpdate: 0,
          obsolete: 0,
        },
        bucketSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
        },
        workboardSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        selectedBucket: bucket,
      });
    }

    const scopeWorkzones = selectedWorkzone ? [selectedWorkzone] : workzones;
    const teknisiWorkzones = branchSas
      ? isSuperAdmin
        ? branchSas
        : branchSas.filter((w) => (workzones ?? []).includes(w))
      : scopeWorkzones;

    const expectedSAs = await (async () => {
      if (branchSas && branchSas.length > 0) {
        const all = await getRekapExpectedServiceAreas(branchParam ?? undefined);
        return isSuperAdmin
          ? all
          : all.filter((s) => (workzones ?? []).includes(s.saName));
      }
      if (selectedWorkzone) {
        return getRekapExpectedServiceAreas(undefined, selectedWorkzone);
      }
      const all = await getRekapExpectedServiceAreas();
      return isSuperAdmin ? all : all.filter((s) => (workzones ?? []).includes(s.saName));
    })();

    if (!isSuperAdmin && (!workzones || workzones.length === 0)) {
      return NextResponse.json({
        rows: [],
        totals: {},
        timestamp: new Date().toISOString(),
        syncDate: today,
        title: 'REKAP WORKORDER ASSURANCE',
        subtitle: '',
        kpiSummary: {
          total: 0,
          kpiCustomer: 0,
          kpiProactive: 0,
          nonKpiUnspec: 0,
          nonTechnical: 0,
          sqmUpdate: 0,
          obsolete: 0,
        },
        bucketSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        bucketBreakdown: {
          kpiCustomer: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          kpiProactive: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonKpiUnspec: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          nonTechnical: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          sqmUpdate: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
          obsolete: { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 },
        },
        workboardSummary: {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: 0,
        },
        selectedBucket: bucket,
      });
    }

    const cacheKey = `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:${today}:${decoded.id_user}:${isSuperAdmin ? 'all' : (scopeWorkzones ?? []).sort().join(',')}:${bucket}:${branchParam ?? ''}`;

    const data = await getOrSetCacheSwr(
      cacheKey,
      async () => {
        const startedAt = Date.now();
        const [
          ticketRowsAll,
          teknisiRows,
          teknisiRegisteredRows,
          agingRows,
          customerLegacyRows,
          customerSqmOverlayRows,
          customerGamasOverlayRows,
        ] = await Promise.all([
          bucket === 'kpi_customer'
            ? getCustomerRekapTicketsSafe(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              )
            : getFilteredRekapTickets(
                decoded.role,
                decoded.id_user,
                today,
                bucket,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              ),
          getRekapTeknisiRows(today, decoded.id_user, teknisiWorkzones),
          getRekapTeknisiRegistered(decoded.id_user, teknisiWorkzones),
          getRekapAging(
            decoded.role,
            decoded.id_user,
            bucket,
            selectedWorkzone,
            branchParam ? Number(branchParam) : undefined,
          ),
          bucket === 'all' || bucket === 'kpi_customer'
            ? Promise.all([
                getLegacyCustomerBucketRows(
                  decoded.role,
                  decoded.id_user,
                  selectedWorkzone,
                  branchParam ? Number(branchParam) : undefined,
                  'b2c',
                ),
                getLegacyCustomerBucketRows(
                  decoded.role,
                  decoded.id_user,
                  selectedWorkzone,
                  branchParam ? Number(branchParam) : undefined,
                  'b2b',
                ),
              ]).then(([b2cRows, b2bRows]) => [...b2cRows, ...b2bRows])
            : Promise.resolve([] as LegacyCustomerBucketRow[]),
          bucket === 'kpi_customer'
            ? getCustomerSqmOverlayTickets(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              ).catch((error) => {
                logger.warn('Customer sqm overlay failed', {
                  role: decoded.role,
                  userId: decoded.id_user,
                  today,
                  error: String((error as Error)?.message ?? error),
                });
                return {
                  proactive: [] as RekapTicketRow[],
                  sqmUpdate: [] as RekapTicketRow[],
                };
              })
            : Promise.resolve({
                proactive: [] as RekapTicketRow[],
                sqmUpdate: [] as RekapTicketRow[],
              }),
          bucket === 'kpi_customer'
            ? getCustomerGamasOverlayTickets(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              ).catch((error) => {
                logger.warn('Customer gamas overlay failed', {
                  role: decoded.role,
                  userId: decoded.id_user,
                  today,
                  error: String((error as Error)?.message ?? error),
                });
                return [] as RekapTicketRow[];
              })
            : Promise.resolve([] as RekapTicketRow[]),
          ]);
        const fetchedAt = Date.now();
        const bucketBreakdown = buildBucketBreakdownFromRekapRows(ticketRowsAll);
        const workboardSummary = buildBucketSummaryFromRows(ticketRowsAll);
        const kpiSummary = {
          total: workboardSummary.total,
          kpiCustomer: bucketBreakdown.kpiCustomer.total,
          kpiProactive: bucketBreakdown.kpiProactive.total,
          nonKpiUnspec: bucketBreakdown.nonKpiUnspec.total,
          nonTechnical: bucketBreakdown.nonTechnical.total,
          sqmUpdate: bucketBreakdown.sqmUpdate.total,
          obsolete: bucketBreakdown.obsolete.total,
        };

        const ticketRows = filterRekapRowsByBucket(ticketRowsAll, bucket);
        const bucketSummary =
          bucket === 'all'
            ? buildBucketSummaryFromRows(ticketRowsAll)
            : buildBucketSummaryFromRows(ticketRows);

        const selectedBucketSummary = buildSelectedBucketSummary(
          bucket,
          ticketRows,
          kpiSummary,
        );
        const normalizedWorkboardSummary = {
          total: workboardSummary.total,
          open: workboardSummary.open,
          assigned: workboardSummary.assigned,
          onProgress: workboardSummary.onProgress,
          pending: workboardSummary.pending,
          close: workboardSummary.close,
        };

        logger.info('Rekap workorder timings', {
          bucket,
          userId: decoded.id_user,
          role: decoded.role,
          totalMs: Date.now() - startedAt,
          fetchMs: fetchedAt - startedAt,
          rows: ticketRowsAll.length,
          filteredRows: ticketRows.length,
          teknisiRows: teknisiRows.length,
        });

        return buildRekapResponse(
          ticketRows,
          teknisiRows,
          today,
          selectedBucketSummary,
          bucket,
          normalizedWorkboardSummary,
          bucketSummary,
          bucketBreakdown,
          customerLegacyRows,
          bucket === 'kpi_customer'
            ? {
                proactive: customerSqmOverlayRows.proactive,
                sqmUpdate: customerSqmOverlayRows.sqmUpdate,
              }
            : undefined,
          bucket === 'kpi_customer' ? customerGamasOverlayRows : undefined,
          expectedSAs,
          teknisiRegisteredRows,
        );
      },
      120,
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    if (isQueryOverloadError(error)) {
      logger.warn('rekap-workorder overloaded', { error: String((error as Error)?.message ?? error) });
      return NextResponse.json({ success: false, message: 'Data sedang disiapkan, coba lagi sesaat lagi.' }, { status: 503 });
    }
    logger.error('Rekap workorder error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
