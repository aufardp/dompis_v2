const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function harness(rows, { ignoreDateFilters = false, resourcePath = '/nossa', now } = {}) {
  const calls = [];
  const modules = new Map();
  const logger = { info() {}, warn() {}, error() {} };
  const Clock = now ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  } : Date;
  const client = {
    QosmicBridgeError: class QosmicBridgeError extends Error {},
    RATE_LIMIT_KEY_BACKFILL: 'backfill',
    qosmicBridgeGet: async (resource, { query }) => {
      assert.equal(resource, resourcePath);
      assert.ok(query.offset <= 5000, 'bridge offsets must remain within its documented cap');
      calls.push({ ...query });
      const filtered = rows.filter((row) => (
        (!query.status || row.Status === query.status)
        && (ignoreDateFilters || !query.date_from || row.Reported_Date >= query.date_from)
        && (ignoreDateFilters || !query.date_to || row.Reported_Date < query.date_to)
      ));
      const data = filtered.slice(query.offset, query.offset + query.limit);
      return { ok: true, resource: resource === '/nossa' ? 'nossa' : 'nossa_closed', filters: query, data,
        meta: { count: data.length, limit: query.limit, offset: query.offset } };
    },
  };
  function load(relative) {
    const filename = path.join(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
      fileName: filename,
    });
    function dependency(id) {
      if (id === './client') return client;
      if (id === '@/lib/observability/logger') return { logger };
      if (id === './window-planner') return load('lib/external-db/qosmic-bridge/window-planner.ts');
      throw new Error(`Unexpected dependency: ${id}`);
    }
    new Function('require', 'module', 'exports', 'Date', outputText)(dependency, module, module.exports, Clock);
    return module.exports;
  }
  return { ...load('lib/external-db/qosmic-bridge/nossa.ts'),
    planner: load('lib/external-db/qosmic-bridge/window-planner.ts'), calls };
}

function fixtureRows(count, dateForIndex) {
  return Array.from({ length: count }, (_, index) => ({
    Incident: `INC${String(index + 1).padStart(8, '0')}`,
    Status: 'ANALYSIS',
    Reported_Date: dateForIndex(index),
  }));
}

async function collect(iterator) {
  const rows = [];
  for await (const page of iterator) rows.push(...page);
  return rows;
}

test('bounded open status scan partitions overflow and returns every incident once', async () => {
  const expected = fixtureRows(6501, (index) => index < 3250
    ? '2026-11-01 10:00:00' : '2026-11-02 10:00:00');
  const app = harness(expected);
  const actual = await collect(app.iterateNossaOpen({
    status: 'ANALYSIS', dateFrom: '2026-11-01', dateTo: '2026-11-03',
  }));
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual.map((row) => row.Incident)).size, expected.length);
  assert.deepEqual(actual.map((row) => row.Incident).sort(), expected.map((row) => row.Incident).sort());
  assert.ok(app.calls.some((call) => call.date_from > '2026-11-01'), 'must narrow the overflowing date window');
});

test('open status below capacity preserves its date bounds and all rows', async () => {
  const expected = fixtureRows(1201, () => '2026-11-02 10:00:00');
  const app = harness(expected);
  const actual = await collect(app.iterateNossaOpen({
    status: 'ANALYSIS', dateFrom: '2026-11-02', dateTo: '2026-11-03',
  }));
  assert.equal(actual.length, expected.length);
  assert.ok(app.calls.every((call) => call.date_from.startsWith('2026-11-02')
    && call.date_to.startsWith('2026-11-03')));
});

test('an irreducibly overflowing open window fails instead of reporting partial success', async () => {
  const app = harness(fixtureRows(6501, () => '2026-11-02 10:30:00'));
  await assert.rejects(() => collect(app.iterateNossaOpen({
    status: 'ANALYSIS', dateFrom: '2026-11-02 10:00:00', dateTo: '2026-11-02 11:00:00',
  })), /overflow|coverage|complete|partial|kapasitas|terpotong/i);
});

test('ignored date filters cannot silently turn an overflowing source into success', async () => {
  const app = harness(fixtureRows(6501, () => '2026-11-02 10:30:00'), { ignoreDateFilters: true });
  await assert.rejects(() => collect(app.iterateNossaOpen({
    status: 'ANALYSIS', dateFrom: '2026-11-02', dateTo: '2026-11-03',
  })), /overflow|coverage|complete|partial|kapasitas|terpotong/i);
});

test('unfiltered overflow includes unknown and missing statuses beyond the first page', async () => {
  const expected = fixtureRows(7001, (index) => index < 3500
    ? '2026-11-01 10:00:00' : '2026-11-02 10:00:00');
  expected[1200].Status = 'AWAITING_VENDOR';
  expected[1200].Additional_Bridge_Field = 'preserved';
  delete expected[6200].Status;
  expected[6200].Additional_Bridge_Field = 'no status field';
  const app = harness(expected);
  const actual = await collect(app.iterateNossaOpen());
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual.map((row) => row.Incident)).size, expected.length);
  assert.deepEqual(actual.map((row) => row.Incident).sort(), expected.map((row) => row.Incident).sort());
  assert.deepEqual(actual.find((row) => row.Incident === expected[1200].Incident), expected[1200]);
  assert.deepEqual(actual.find((row) => row.Incident === expected[6200].Incident), expected[6200]);
  assert.ok(app.calls.some((call) => call.date_from), 'overflow must switch to date-based coverage');
  assert.ok(app.calls.every((call) => call.status === undefined), 'full coverage must not restrict unknown statuses');
});

test('closed incremental scan includes all of today in WIB with tomorrow as its exclusive end', async () => {
  const expected = fixtureRows(1, () => '2026-11-02 10:00:00');
  expected[0].Status = 'CLOSED';
  for (const instant of ['2026-11-02T03:00:00Z', '2026-11-01T18:00:00Z']) {
    const app = harness(expected, { resourcePath: '/nossa-closed', now: new Date(instant) });
    const actual = await collect(app.iterateNossaClosedIncremental(1));
    assert.equal(app.calls[0].date_from, '2026-11-01');
    assert.equal(app.calls[0].date_to, '2026-11-03');
    assert.deepEqual(actual, expected);
  }
});

test('an irreducibly overflowing closed window rejects incomplete coverage', async () => {
  const app = harness(fixtureRows(6501, () => '2026-11-02 10:30:00'), {
    resourcePath: '/nossa-closed',
  });
  await assert.rejects(() => collect(app.iterateNossaClosedWindow({
    dateFrom: '2026-11-02 10:00:00', dateTo: '2026-11-02 11:00:00',
  })), /overflow|coverage|complete|partial|kapasitas|terpotong/i);
});

test('unbounded open fallback retains sampled older incidents and deduplicates window results', async () => {
  const expected = fixtureRows(7001, (index) => index < 3500
    ? '2026-11-01 10:00:00' : '2026-11-02 10:00:00');
  expected[0].Reported_Date = '2025-12-31 10:00:00';
  const app = harness(expected);
  const actual = await collect(app.iterateNossaOpen());
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual.map((row) => row.Incident)).size, expected.length);
  assert.deepEqual(actual.find((row) => row.Incident === expected[0].Incident), expected[0]);
});

test('one-hour open and closed overflow splits further and yields all distributed incidents once', async () => {
  const start = Date.parse('2026-11-02T13:30:00Z');
  const expected = fixtureRows(6501, (index) => new Date(start + Math.floor(index * 3600 / 6501) * 1000)
    .toISOString().slice(0, 19).replace('T', ' '));
  const window = { dateFrom: '2026-11-02 13:30:00', dateTo: '2026-11-02 14:30:00' };
  for (const resourcePath of ['/nossa', '/nossa-closed']) {
    const app = harness(expected, { resourcePath });
    const iterator = resourcePath === '/nossa'
      ? app.iterateNossaOpen(window) : app.iterateNossaClosedWindow(window);
    const actual = await collect(iterator);
    assert.equal(actual.length, expected.length);
    assert.equal(new Set(actual.map((row) => row.Incident)).size, expected.length);
    assert.deepEqual(actual.map((row) => row.Incident).sort(), expected.map((row) => row.Incident).sort());
  }
});

test('initial windows preserve a fractional-hour interval without dropping its tail', () => {
  const { planner } = harness([]);
  assert.deepEqual(planner.splitIntoInitialWindows('2026-11-02 00:00:00', '2026-11-02 00:25:30'), [
    { dateFrom: '2026-11-02 00:00:00', dateTo: '2026-11-02 00:25:30' },
  ]);
});

test('a 31-second window bisects into contiguous 15 and 16-second windows', () => {
  const { planner } = harness([]);
  assert.deepEqual(planner.bisectWindow({ dateFrom: '2026-11-02 00:00:00', dateTo: '2026-11-02 00:00:31' }), [
    { dateFrom: '2026-11-02 00:00:00', dateTo: '2026-11-02 00:00:15' },
    { dateFrom: '2026-11-02 00:00:15', dateTo: '2026-11-02 00:00:31' },
  ]);
  assert.equal(planner.bisectWindow({ dateFrom: '2026-11-02 00:00:00', dateTo: '2026-11-02 00:00:01' }), null);
});
