const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadService(relativePath, dependencies = {}) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
    fileName: filename,
  });
  const module = { exports: {} };
  const requireDependency = (id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (id === 'date-fns' || id === 'date-fns-tz') return require(id);
    return {};
  };
  new Function('require', 'module', 'exports', outputText)(
    requireDependency, module, module.exports,
  );
  return module.exports;
}

const { TicketService } = loadService('app/libs/services/tickets.service.ts', {
  '@/lib/search-intent': { normalizeSearchInput: (value) => value.trim() },
  './daily-ticket-where': { applyBranchScopeWhere: async () => {} },
});
const { buildSqlWhereClause } = loadService('app/libs/services/daily-ticket-helpers.ts');

async function ticketWhere(filters) {
  return TicketService.buildTicketWhere('superadmin', 1, filters);
}

function filterFor(where, field) {
  return where.AND?.find((clause) => Object.hasOwn(clause, field))?.[field];
}

test('status date range uses local WIB strings accepted by the VARCHAR schema', async () => {
  const where = await ticketWhere({ statusDateStart: '2026-11-02', statusDateEnd: '2026-11-02' });
  const bounds = filterFor(where, 'status_date');
  assert.deepEqual(bounds, { gte: '2026-11-02 00:00:00', lte: '2026-11-02 23:59:59' });
  const dates = [
    '2026-11-01 23:59:59',
    '2026-11-02 00:00:00',
    '2026-11-02 12:34:56',
    '2026-11-02 23:59:59',
    '2026-11-03 00:00:00',
  ];
  assert.deepEqual(dates.filter((date) => date >= bounds.gte && date <= bounds.lte), dates.slice(1, 4));
});

test('status date supports an open-ended starting date', async () => {
  const where = await ticketWhere({ statusDateStart: '2026-11-02' });
  assert.deepEqual(filterFor(where, 'status_date'), { gte: '2026-11-02 00:00:00' });
});

test('status date supports an open-ended ending date', async () => {
  const where = await ticketWhere({ statusDateEnd: '2026-11-02' });
  assert.deepEqual(filterFor(where, 'status_date'), { lte: '2026-11-02 23:59:59' });
});

test('absent status date filters do not constrain tickets', async () => {
  assert.equal(filterFor(await ticketWhere({}), 'status_date'), undefined);
});

test('reported DateTime bounds remain Date objects alongside string status bounds', async () => {
  const where = await ticketWhere({
    startDate: '2026-11-01', endDate: '2026-11-02',
    statusDateStart: '2026-11-02', statusDateEnd: '2026-11-02',
  });
  const bounds = filterFor(where, 'reported_date_dt');
  assert.ok(bounds.gte instanceof Date);
  assert.ok(bounds.lte instanceof Date);
  assert.equal(bounds.gte.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(bounds.lte.toISOString(), '2026-11-02T16:59:59.000Z');
  assert.equal(typeof filterFor(where, 'status_date').gte, 'string');
});

for (const field of ['jenis_tiket_1', 'jenis_tiket_2', 'symptom', 'contact_name']) {
  test(`${field} contains remains a substring query without requiring FULLTEXT indexes`, () => {
    const [sql, params] = buildSqlWhereClause({ [field]: { contains: 'network' } });
    assert.equal(sql, `\`${field}\` LIKE ?`);
    assert.deepEqual(params, ['%network%']);
  });

  test(`${field} not.contains preserves exclusions without requiring FULLTEXT indexes`, () => {
    const [sql, params] = buildSqlWhereClause({ [field]: { not: { contains: 'network' } } });
    assert.equal(sql, `\`${field}\` NOT LIKE ?`);
    assert.deepEqual(params, ['%network%']);
  });
}

test('nested OR and NOT preserve grouping and parameter order', () => {
  const [sql, params] = buildSqlWhereClause({
    AND: [
      { OR: [{ jenis_tiket_1: { contains: 'network' } }, { symptom: { contains: 'LOS' } }] },
      { NOT: { jenis_tiket_2: { contains: 'customer' } } },
    ],
  });
  assert.equal(sql, '((`jenis_tiket_1` LIKE ? OR `symptom` LIKE ?) AND NOT (`jenis_tiket_2` LIKE ?))');
  assert.deepEqual(params, ['%network%', '%LOS%', '%customer%']);
});

for (const term of ['IP', 'SQM-CCAN', 'foo +bar -baz', "customer's outage"]) {
  test(`substring search keeps punctuation and short tokens in bound parameters: ${term}`, () => {
    const [sql, params] = buildSqlWhereClause({ symptom: { contains: term } });
    assert.equal(sql, '`symptom` LIKE ?');
    assert.deepEqual(params, [`%${term}%`]);
  });
}
