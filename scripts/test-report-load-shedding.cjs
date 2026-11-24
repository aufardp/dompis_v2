const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

function trackedQuery(state) {
  return async () => {
    state.active++;
    state.maximum = Math.max(state.maximum, state.active);
    await new Promise(resolve => setTimeout(resolve, 5));
    state.active--;
    return [];
  };
}

test('rekap cold-cache loader limits parallel report queries to two', async () => {
  const state = { active: 0, maximum: 0 };
  const noop = () => {};
  const harness = createHarness({
    'next/server': { NextResponse: Response },
    '@/app/libs/protectApi': { protectApi: async () => ({ role: 'superadmin', id_user: 1 }) },
    '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
    '@/app/helpers/ticket.helpers': { getWorkzonesForUser: async () => [], resolveBranchScope: async () => null },
    '@/lib/timezone': { toWibDateString: () => '2026-11-24' },
    '@/lib/cache/scope-key': { buildScopeKeyWithWorkzones: () => 'scope' },
    '@/lib/cache': {
      DASHBOARD_CACHE_TTL: 60,
      getOrSetCacheSwr: async (_key, build) => build(),
    },
    '@/lib/sql/max-execution-time': { isQueryOverloadError: () => false },
    '@/lib/observability/logger': { logger: { info: noop, warn: noop, error: (...args) => console.error(...args) } },
    '@/app/api/dashboard/rekap-workorder/queries': {
      REKAP_WORKORDER_CACHE_VERSION: 'test',
      getCustomerRekapTicketsSafe: trackedQuery(state),
      getFilteredRekapTickets: trackedQuery(state),
      getRekapTeknisiRows: trackedQuery(state),
      getRekapTeknisiRegistered: trackedQuery(state),
      getLegacyCustomerBucketRows: trackedQuery(state),
      getCustomerSqmOverlayTickets: trackedQuery(state),
      getCustomerGamasOverlayTickets: trackedQuery(state),
      getRekapExpectedServiceAreas: async () => [],
    },
    '@/app/api/dashboard/rekap-workorder/aggregate': {
      buildBucketBreakdownFromRekapRows: () => Object.fromEntries(
        ['kpiCustomer', 'kpiProactive', 'nonKpiUnspec', 'nonTechnical', 'sqmUpdate', 'obsolete']
          .map(key => [key, { total: 0 }]),
      ),
      buildBucketSummaryFromRows: () => ({ total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0 }),
      filterRekapRowsByBucket: rows => rows,
      buildSelectedBucketSummary: () => ({}),
      buildRekapResponse: () => ({}),
      buildLegacyCustomerRowsFromRekapRows: () => [],
    },
  });
  const { GET } = harness.load('app/api/dashboard/rekap-workorder/route.ts');
  const response = await GET({ nextUrl: new URL('https://dompis.invalid/api/dashboard/rekap-workorder') });
  assert.equal(response.status, 200);
  assert.equal(state.maximum, 2);
});

test('semesta cold-cache computation is admitted as interactive work', async () => {
  let priority;
  const harness = createHarness({
    'next/server': { NextResponse: Response },
    '@/app/libs/protectApi': { protectApi: async () => ({ role: 'admin', id_user: 7 }) },
    '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
    '@/lib/cache/scope-key': { getDashboardScopePart: async () => 'scope' },
    '@/lib/cache': {
      getOrSetCacheSwr: async (_key, build, _ttl, options) => {
        priority = options.priority;
        return build();
      },
    },
    '@/app/libs/services/tickets.service': { TicketService: { getSemestaAnalyticsV2: async () => ({}) } },
    '@/lib/sql/max-execution-time': { isQueryOverloadError: () => false },
    '@/app/libs/apiError': { getErrorMessage: String, getErrorStatus: () => 500 },
  });
  const { GET } = harness.load('app/api/dashboard/semesta-analytics/route.ts');
  const response = await GET(new Request('https://dompis.invalid/api/dashboard/semesta-analytics'));
  assert.equal(response.status, 200);
  assert.equal(priority, 'interactive');
});
