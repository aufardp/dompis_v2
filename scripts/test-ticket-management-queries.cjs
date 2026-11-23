const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

const buckets = ['kpi_customer', 'kpi_proactive', 'non_kpi_unspec', 'non_technical', 'sqm_update', 'obsolete'];

test('all list bucket filters use the generated classification used by summaries', () => {
  const { buildOperationalBucketWhere } = createHarness().load('app/libs/services/ticket-buckets.ts');
  for (const bucket of buckets) assert.deepEqual(buildOperationalBucketWhere(bucket), { operational_bucket: bucket });
});

test('customer bucket filters active tickets by today sync date', async () => {
  const harness = createHarness();
  const where = await harness.load('app/libs/services/daily-ticket-where.ts').buildDailyTicketWhere('superadmin', 1, { operationalBucket: ['kpi_customer'] });
  const [sql, params] = harness.load('app/libs/services/daily-ticket-helpers.ts').buildSqlWhereClause(where);
  assert.ok(sql.includes('sync_date'));
  assert.ok(sql.includes('operational_bucket'));
  assert.ok(params.includes('kpi_customer'));
});

test('workzone codes and numeric IDs are resolved without silently widening the scope', async () => {
  const { resolveSelectedWorkzone } = createHarness({
    '@/app/helpers/ticket.helpers': { resolveWorkzoneName: async id => id === 7 ? 'DMO' : null },
  }).load('app/libs/services/daily-ticket-where.ts');
  assert.equal(await resolveSelectedWorkzone(' GBG '), 'GBG');
  assert.equal(await resolveSelectedWorkzone('7'), 'DMO');
  assert.equal(await resolveSelectedWorkzone('9999'), '__unknown_workzone__');
  assert.equal(await resolveSelectedWorkzone(), null);
});

test('SQL filters enforce both date boundaries and handle an empty workzone intersection', () => {
  const { buildSqlWhereClause } = createHarness().load('app/libs/services/daily-ticket-helpers.ts');
  const [sql, params] = buildSqlWhereClause({ reported_date: { gte: '2026-11-01', lte: '2026-11-15' }, workzone: { in: [] } });
  assert.match(sql, /`reported_date` >= \?/);
  assert.match(sql, /`reported_date` <= \?/);
  assert.match(sql, /1=0/);
  assert.deepEqual(params, ['2026-11-01', '2026-11-15']);
});

test('bucket matrix includes neutral tickets in all while keeping B2C and B2B separate', async () => {
  let query;
  const { getKpiBucketSummaryMatrix } = createHarness({
    '@/lib/cache': { getOrSetCache: async (_key, fn) => fn() },
    '@/app/libs/prisma': { $queryRawUnsafe: async sql => {
      query = sql;
      return [{ bucket: 'non_technical', seg: 'netral', total: 3, open: 3 }, { bucket: 'non_technical', seg: 'b2b', total: 2, open: 2 }];
    } },
  }).load('app/libs/services/daily-ticket-kpi-matrix.ts');
  const matrix = await getKpiBucketSummaryMatrix('superadmin', 1);
  assert.equal(matrix.all.non_technical.total, 5);
  assert.equal(matrix.b2b.non_technical.total, 2);
  assert.equal(matrix.b2c.non_technical.total, 0);
  assert.match(query, /GROUP BY operational_bucket, kpi_seg/);
  assert.match(query, /SELECT \/\*\+ MAX_EXECUTION_TIME/);
});

test('daily hook keys include ordering, avoids old scope placeholders, and refreshes without a page reload', () => {
  let options;
  const { useDailyTicketPage } = createHarness({
    react: { useMemo: fn => fn() },
    '@tanstack/react-query': { useQuery: value => { options = value; return {}; }, keepPreviousData: value => value },
    '@/app/libs/fetcher': {},
  }).load('app/hooks/useDailyTicketPage.ts');
  useDailyTicketPage({ dept: 'all', page: 1, workzone: 'DMO', sortField: 'bookingDate', sortOrder: 'asc' });
  assert.equal(options.queryKey[2].sortField, 'bookingDate');
  assert.equal(options.queryKey[2].sortOrder, 'asc');
  assert.equal(options.placeholderData({ data: ['old'] }, { queryKey: ['tickets', 'daily', { workzone: 'GBG' }] }), undefined);
  assert.deepEqual(options.placeholderData({ data: ['same-scope'] }, { queryKey: options.queryKey }), { data: ['same-scope'] });
  assert.equal(options.refetchInterval, 30000);
});
