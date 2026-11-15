const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function gateHarness(t, concurrency = 2, waitMs = 100) {
  const names = ['CACHE_COMPUTE_CONCURRENCY', 'CACHE_COMPUTE_WAIT_MS'];
  const previous = names.map(name => process.env[name]);
  process.env.CACHE_COMPUTE_CONCURRENCY = String(concurrency);
  process.env.CACHE_COMPUTE_WAIT_MS = String(waitMs);
  t.after(() => names.forEach((name, i) => {
    if (previous[i] === undefined) delete process.env[name];
    else process.env[name] = previous[i];
  }));
  return createHarness({
    '@/lib/redis': { ensureRedisReady: async () => false },
    '@/lib/ingestion/sync-state': { isRevisionSyncEnabled: () => false },
  });
}

test('parallel daily cache misses complete their nested validation caches and queued badges', { timeout: 1500 }, async t => {
  const harness = gateHarness(t);
  const { getOrSetCache, getOrSetCacheSwr } = harness.load('lib/cache.ts');
  const bothEntered = deferred();
  let entered = 0;
  const daily = dept => getOrSetCache(`daily:${dept}`, async () => {
    if (++entered === 2) bothEntered.resolve();
    await bothEntered.promise;
    return getOrSetCacheSwr(`validation:${dept}`, async () => dept);
  });
  const requests = [daily('b2c'), daily('b2b')];
  await bothEntered.promise;
  const badge = getOrSetCache('badge', async () => 42);
  assert.deepEqual(await Promise.all([...requests, badge]), ['b2c', 'b2b', 42]);
});

test('daily route and table service return ticket lists during parallel cold-cache requests', { timeout: 2000 }, async t => {
  gateHarness(t);
  const bothEntered = deferred();
  let entered = 0;
  const service = {};
  const harness = createHarness({
    '@/lib/redis': { ensureRedisReady: async () => false },
    '@/lib/ingestion/sync-state': { isRevisionSyncEnabled: () => false },
    '@/app/libs/protectApi': { protectApi: async () => ({ role: 'superadmin', id_user: 2 }) },
    '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
    '@/app/libs/services/daily-ticket.service': { DailyTicketService: service },
    '@/app/libs/prisma': { $queryRawUnsafe: async () => [{ total: 1, open: 1 }] },
    '@/app/libs/services/daily-ticket-where': {
      buildDailyTicketWhere: async () => ({}),
      buildMainTableWhere: where => where,
      buildValidasiBaseWhere: () => ({}),
      fetchTicketIdsBySql: async () => {
        if (++entered === 2) bothEntered.resolve();
        await bothEntered.promise;
        return { rows: [{ id_ticket: 7, rank_global: 1 }], nextCursor: null };
      },
    },
    '@/app/libs/services/daily-ticket-helpers': {
      buildSqlWhereClause: () => ['1=1', []],
      splitDailyFilterUnion: () => null,
      buildStatusCategorySql: () => "'open'",
      normalizeCacheFilterValue: value => value,
      queryRawWithOptionalIndex: async () => [],
      summarizeBucketRows: () => ({ ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 }),
      hydrateTicketsByIds: async ids => ids.map(id_ticket => ({ id_ticket })),
      mapTicket: ticket => ticket,
    },
  });
  service.getDailyTicketTable = harness.load('app/libs/services/daily-ticket-table.ts').getDailyTicketTable;
  const api = harness.load('app/api/tickets/daily/route.ts');
  const responses = await Promise.all(['b2c', 'b2b'].map(dept => api.GET(new Request(
    `https://dompis.invalid/api/tickets/daily?dept=${dept}&includeValidasiTickets=false&includeOptions=false&operationalBucket=kpi_customer`,
  ))));
  for (const response of responses) {
    const json = await response.json();
    assert.equal(response.status, 200, JSON.stringify(json));
    assert.equal(json.success, true);
    assert.equal(json.data.validasiCount, 1);
    assert.equal(json.data.total, 1);
    assert.deepEqual(json.data.data, [{ id_ticket: 7, rank: 1 }]);
  }
  const summaryResponse = await api.GET(new Request('https://dompis.invalid/api/tickets/daily?dept=all&summaryOnly=true&includeValidasiTickets=false&includeOptions=false&operationalBucket=kpi_customer'));
  const summary = await summaryResponse.json();
  assert.equal(summaryResponse.status, 200);
  assert.equal(entered, 2);
  assert.deepEqual(summary.data.data, []);
  assert.equal(summary.data.total, 1);
  assert.equal(summary.data.validasiCount, 1);
});

test('independent computations stay within the concurrency limit and release slots on failure', async t => {
  const { withQueryGate } = gateHarness(t, 2).load('lib/sql/query-gate.ts');
  let active = 0;
  let peak = 0;
  const jobs = Array.from({ length: 6 }, (_, i) => withQueryGate(async () => {
    peak = Math.max(peak, ++active);
    try {
      await delay(5);
      if (i === 1) throw new Error('database failed');
      return i;
    } finally {
      active--;
    }
  }));
  const results = await Promise.allSettled(jobs);
  assert.equal(peak, 2);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(await withQueryGate(async () => 'recovered'), 'recovered');
});

test('expired waiters fail with 503 and never execute after a slot is released', { timeout: 1000 }, async t => {
  const { withQueryGate } = gateHarness(t, 1, 20).load('lib/sql/query-gate.ts');
  const release = deferred();
  const entered = deferred();
  const holder = withQueryGate(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  let ran = false;
  try {
    await assert.rejects(withQueryGate(async () => { ran = true; }), error => error.status === 503);
  } finally {
    release.resolve();
    await holder;
  }
  assert.equal(await withQueryGate(async () => 'next'), 'next');
  assert.equal(ran, false);
});

test('a detached descendant reacquires a slot after its parent has completed', { timeout: 1000 }, async t => {
  const { withQueryGate } = gateHarness(t, 1, 20).load('lib/sql/query-gate.ts');
  const startChild = deferred();
  let child;
  await withQueryGate(async () => {
    child = startChild.promise.then(() => withQueryGate(async () => 'child'));
  });
  const release = deferred();
  const entered = deferred();
  const holder = withQueryGate(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  startChild.resolve();
  try {
    await assert.rejects(child, error => error.status === 503);
  } finally {
    release.resolve();
    await holder;
  }
});

test('daily API returns a logged JSON 503 for queue saturation and database overload', async () => {
  for (const error of [Object.assign(new Error('queue full'), { status: 503 }), Object.assign(new Error('pool timeout'), { code: 'P2024' })]) {
    const warnings = [];
    const api = createHarness({
      '@/app/libs/protectApi': { protectApi: async () => ({ role: 'superadmin', id_user: 2 }) },
      '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
      '@/lib/cache': { getOrSetCache: async () => { throw error; } },
      '@/app/libs/services/daily-ticket.service': { DailyTicketService: {} },
      '@/lib/observability/logger': { logger: { warn: (...args) => warnings.push(args), error: () => {} } },
    }).load('app/api/tickets/daily/route.ts');
    const response = await api.GET(new Request('https://dompis.invalid/api/tickets/daily?dept=b2c'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '30');
    assert.equal((await response.json()).success, false);
    assert.equal(warnings.length, 1);
  }
});

test('daily hook reports an HTML proxy timeout without retrying automatically', async () => {
  let options;
  const { useDailyTicketPage } = createHarness({
    react: { useMemo: fn => fn() },
    '@tanstack/react-query': { useQuery: value => { options = value; return { isLoading: false }; }, keepPreviousData: value => value },
    '@/app/libs/fetcher': { fetchWithAuth: async () => new Response('<html>Timeout</html>', { status: 524 }) },
  }).load('app/hooks/useDailyTicketPage.ts');
  useDailyTicketPage({ dept: 'all', page: 1 });
  assert.equal(options.retry, false);
  await assert.rejects(options.queryFn(), error => /524/.test(error.message) && !(error instanceof SyntaxError));
});
