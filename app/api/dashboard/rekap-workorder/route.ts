import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import {
  getOrSetCacheSwr,
  getCache,
  setCache,
  DASHBOARD_CACHE_TTL,
} from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getWorkzonesForUser, resolveBranchScope } from '@/app/helpers/ticket.helpers';
import { buildScopeKeyWithWorkzones } from '@/lib/cache/scope-key';
import { toWibDateString } from '@/lib/timezone';
import { isQueryOverloadError } from '@/lib/sql/max-execution-time';
import { type KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { logger } from '@/lib/observability/logger';
import type { LegacyCustomerBucketRow, RekapResponse, RekapTicketRow } from './types';
import {
  buildBucketBreakdownFromRekapRows,
  buildBucketSummaryFromRows,
  filterRekapRowsByBucket,
  buildSelectedBucketSummary,
  buildRekapResponse,
  buildLegacyCustomerRowsFromRekapRows,
} from './aggregate';
import {
  REKAP_WORKORDER_CACHE_VERSION,
  getCustomerRekapTicketsSafe,
  getFilteredRekapTickets,
  getRekapTeknisiRows,
  getRekapTeknisiRegistered,
  getLegacyCustomerBucketRows,
  getCustomerSqmOverlayTickets,
  getCustomerGamasOverlayTickets,
  getRekapExpectedServiceAreas,
} from './queries';

const REKAP_LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;

type RekapLastGoodCache = {
  generatedAt: number;
  syncDate: string;
  data: RekapResponse;
};

async function storeLastGoodRekap(
  key: string,
  data: RekapResponse,
  syncDate: string,
): Promise<void> {
  if (data.syncDate !== syncDate || typeof data.timestamp !== 'string') return;
  const generatedAt = Date.parse(data.timestamp);
  if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > DASHBOARD_CACHE_TTL * 1000) return;

  const ttlSeconds = Math.floor(
    (generatedAt + REKAP_LAST_GOOD_TTL_SECONDS * 1000 - Date.now()) / 1000,
  );
  if (ttlSeconds <= 0) return;

  const previous = await getCache<RekapLastGoodCache>(key);
  if (previous && previous.generatedAt >= generatedAt) return;
  await setCache(key, { generatedAt, syncDate, data }, ttlSeconds);
}

function isServiceUnavailable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error &&
    Number((error as { status?: unknown }).status) === 503;
}

export async function GET(request: NextRequest) {
  let lastGoodCacheKey: string | undefined;
  let requestSyncDate: string | undefined;
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
    requestSyncDate = today;
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
      branchSas.length === 0
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

    const resolvedBranchSas = branchSas
      ? branchSas.filter((sa) => isSuperAdmin || (workzones ?? []).includes(sa))
      : null;
    const teknisiWorkzones = branchSas
      ? isSuperAdmin
        ? branchSas
        : branchSas.filter((w) => (workzones ?? []).includes(w))
      : scopeWorkzones;

    const branchScopeKey = resolvedBranchSas
      ? encodeURIComponent([...resolvedBranchSas].sort().join(','))
      : 'all';
    const cacheKey = `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:${today}:${buildScopeKeyWithWorkzones(isSuperAdmin, decoded.role, decoded.id_user, scopeWorkzones)}:${bucket}:${branchParam ?? ''}:${branchScopeKey}`;
    lastGoodCacheKey = `${cacheKey}:last-good:v1`;

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

    const data = await getOrSetCacheSwr(
      cacheKey,
      async () => {
        const startedAt = Date.now();
        // Keep cold-cache report work bounded. These cache helpers inherit the
        // outer query-gate slot, so Promise.all across all six would otherwise
        // fan out six database queries while consuming only one gate slot.
        const [ticketRowsAll, teknisiRows] = await Promise.all([
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
        ]);
        const [teknisiRegisteredRows, customerLegacyRows] = await Promise.all([
          getRekapTeknisiRegistered(decoded.id_user, teknisiWorkzones),
          bucket === 'kpi_customer'
            ? getLegacyCustomerBucketRows(
                decoded.role,
                decoded.id_user,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
                'all',
              )
            : Promise.resolve([] as LegacyCustomerBucketRow[]),
        ]);
        const [customerSqmOverlayRows, customerGamasOverlayRows] = await Promise.all([
          bucket === 'kpi_customer'
            ? getCustomerSqmOverlayTickets(
                decoded.role,
                decoded.id_user,
                today,
                selectedWorkzone,
                branchParam ? Number(branchParam) : undefined,
              ).catch((error) => {
                if (isQueryOverloadError(error) || isServiceUnavailable(error)) throw error;
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
                if (isQueryOverloadError(error) || isServiceUnavailable(error)) throw error;
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
        const effectiveCustomerLegacyRows =
          bucket === 'all'
            ? buildLegacyCustomerRowsFromRekapRows(ticketRowsAll)
            : customerLegacyRows;
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
          effectiveCustomerLegacyRows,
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
      Math.max(DASHBOARD_CACHE_TTL, 120),
      { priority: 'interactive' },
    );

    await storeLastGoodRekap(lastGoodCacheKey, data, today);

    return NextResponse.json(data);
  } catch (error: unknown) {
    if (isQueryOverloadError(error) || isServiceUnavailable(error)) {
      if (lastGoodCacheKey && requestSyncDate) {
        const cached = await getCache<RekapLastGoodCache>(lastGoodCacheKey);
        const generatedAt = cached?.generatedAt ?? 0;
        if (
          cached &&
          cached.syncDate === requestSyncDate &&
          cached.data.syncDate === requestSyncDate &&
          Date.now() - generatedAt < REKAP_LAST_GOOD_TTL_SECONDS * 1000
        ) {
          const ageSeconds = Math.max(0, Math.floor((Date.now() - generatedAt) / 1000));
          logger.warn('rekap-workorder serving last good scoped cache', {
            syncDate: requestSyncDate,
            ageSeconds,
            error: String((error as Error)?.message ?? error),
          });
          return NextResponse.json(cached.data, {
            headers: {
              'X-Data-Stale': 'true',
              'X-Data-Age-Seconds': String(ageSeconds),
            },
          });
        }
      }
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
