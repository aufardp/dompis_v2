const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const now = new Date('2026-11-02T03:00:00.000Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
  static [Symbol.hasInstance](value) { return value instanceof Date; }
}

function fixture(id, overrides = {}) {
  return {
    id_ticket: id, incident: `INC${id}`, service_no: '123456789', customer_name: 'Customer',
    workzone: 'PKL', jenis_tiket_2: 'REG', customer_type: 'REGULER', flagging_manja: null,
    reported_date_dt: '2026-11-02 09:00:00', booking_date: null,
    status: 'OPEN', status_update: null, ...overrides,
  };
}

function harness(rows = [], history = [], user = { id_user: 1, role: 'superadmin' }) {
  const modules = new Map();
  const branchIds = [];
  const query = async (sql) => {
    const text = String(sql).replace(/\s+/g, ' ');
    if (/AS tickets_30d/i.test(text)) return rows.map((row) => ({
      ...row, tickets_30d: row.tickets_30d ?? 0, reg_hvc_30d: row.reg_hvc_30d ?? 0,
      last_reg_hvc_incident: row.last_reg_hvc_incident ?? history.find((item) => item.service_no === row.service_no)?.incident ?? null,
    }));
    throw new Error(`Unhandled fixture query: ${text}`);
  };
  const stubs = {
    '@/app/libs/prisma': { $queryRawUnsafe: query, $queryRaw: query, users: { findUnique: async () => ({ branch_id: 999, area: null, user_branch: [] }) } },
    '@/app/libs/protectApi': { protectApi: async () => user },
    '@/lib/observability/logger': { logger: { error() {} } },
    '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
    '@/app/helpers/ticket.helpers': {
      getBranchServiceAreaNames: async (id) => { branchIds.push(id); return id === 10 ? ['PKL'] : []; },
    },
    '@/lib/cache': { getOrSetCache: async (_key, build) => build() },
    'next/server': { NextResponse: Response },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, esModuleInterop: true }, fileName: filename,
    });
    function dependency(id) {
      const resolved = id.startsWith('@/') ? path.join(root, id.slice(2))
        : id.startsWith('.') ? path.resolve(path.dirname(filename), id) : null;
      const alias = resolved ? `@/${path.relative(root, resolved)}` : id;
      if (Object.hasOwn(stubs, alias)) return stubs[alias];
      if (resolved) return load(existsSync(`${resolved}.ts`) ? `${resolved}.ts` : resolved);
      return require(id);
    }
    new Function('require', 'module', 'exports', 'Date', outputText)(dependency, module, module.exports, Clock);
    return module.exports;
  }
  return { load, branchIds };
}

async function requestTickets(app, params) {
  const { GET } = app.load('app/api/priority/tickets/route.ts');
  const response = await GET({ nextUrl: new URL(`http://localhost/api/priority/tickets?${params}`) });
  assert.equal(response.status, 200);
  return (await response.json()).data;
}

test('within includes both safe and near REG tickets', async () => {
  const app = harness([fixture(1), fixture(2, { reported_date_dt: '2026-10-31 23:00:00' })]);
  const data = await requestTickets(app, 'branch=PKL&kind=reguler&state=within');
  assert.deepEqual(data.rows.map((row) => row.id_ticket).sort(), [1, 2]);
  assert.equal(data.meta.counts.within, 2);
});

test('missing branch defaults consistently to PKL rather than querying FLO', async () => {
  const app = harness([fixture(1)]);
  const data = await requestTickets(app, 'kind=reguler');
  assert.equal(data.meta.branch, 'PKL');
  assert.deepEqual(data.rows.map((row) => row.id_ticket), [1]);
  assert.equal(app.branchIds[0], 10);
});

test('open HI drilldown includes incoming tickets already closed today', async () => {
  const app = harness([fixture(1), fixture(2, { status: 'CLOSED' })]);
  const data = await requestTickets(app, 'branch=PKL&kind=reguler&subKind=open_hi');
  assert.equal(data.meta.total, 2);
  assert.deepEqual(data.rows.map((row) => row.id_ticket).sort(), [1, 2]);
});

test('gaul totals count current candidates once rather than expanding history rows', async () => {
  const app = harness([fixture(2, { jenis_tiket_2: 'SQM' })], [fixture(1, { reported_date_dt: '2026-11-01 09:00:00' })]);
  const data = await requestTickets(app, 'branch=PKL&kind=sqm&subKind=gaul');
  assert.equal(data.meta.total, 1);
  assert.deepEqual(data.rows.map((row) => row.id_ticket), [2]);
});

test('summary excludes SQM premium customers from regular TTR counts', async () => {
  const app = harness([fixture(1), fixture(2, { jenis_tiket_2: 'SQM', customer_type: 'HVC_DIAMOND' })]);
  const { queryAllPrioritySummary } = app.load('app/libs/priority/queries.ts');
  const data = await queryAllPrioritySummary();
  assert.equal(data.branches.PKL.reguler_ttr.diamond_vvip.all, 0);
  assert.equal(data.branches.PKL.reguler_ttr.reguler.all, 1);
});

test('Prisma Timestamp Date and equivalent WIB string represent the same TTR instant', () => {
  const { resolveTtrBucket } = harness().load('app/libs/priority/ttr.ts');
  const common = fixture(1, { customer_type: 'HVC_DIAMOND', reported_date_dt: '2026-11-02 10:00:00' });
  const stringResult = resolveTtrBucket(common, now);
  const dateResult = resolveTtrBucket({ ...common, reported_date_dt: new Date('2026-11-02T03:00:00.000Z') }, now);
  assert.equal(dateResult.deadline_at?.toISOString(), stringResult.deadline_at?.toISOString());
  assert.equal(dateResult.deadline_at?.toISOString(), '2026-11-02T06:00:00.000Z');
  assert.equal(dateResult.ttr_state, stringResult.ttr_state);
  assert.equal(dateResult.is_invalid_future_date, false);
});

test('future MANJA booking is a valid scheduled appointment with a future deadline', () => {
  const { resolveTtrBucket } = harness().load('app/libs/priority/ttr.ts');
  const result = resolveTtrBucket(fixture(1, { flagging_manja: 'MANJA', booking_date: '2026-11-02 14:00:00' }), now);
  assert.equal(result.bucket, 'manja');
  assert.equal(result.deadline_at?.toISOString(), '2026-11-02T10:00:00.000Z');
  assert.equal(result.is_invalid_future_date, false);
});

test('existing safe, near and over classifications retain their thresholds', () => {
  const { resolveTtrBucket } = harness().load('app/libs/priority/ttr.ts');
  assert.equal(resolveTtrBucket(fixture(1), now).ttr_state, 'safe');
  assert.equal(resolveTtrBucket(fixture(2, { reported_date_dt: '2026-10-31 23:00:00' }), now).ttr_state, 'near');
  assert.equal(resolveTtrBucket(fixture(3, { reported_date_dt: '2026-10-31 10:00:00' }), now).ttr_state, 'over');
});

test('future reported dates remain invalid even though future bookings are valid', () => {
  const { resolveTtrBucket } = harness().load('app/libs/priority/ttr.ts');
  const result = resolveTtrBucket(fixture(1, { reported_date_dt: '2026-11-02 14:00:00' }), now);
  assert.equal(result.deadline_at, null);
  assert.equal(result.is_invalid_future_date, true);
});

for (const flag of ['N', 'NO', '0', 'NON_MANJA']) {
  test(`false MANJA flag ${flag} does not classify a REG ticket as MANJA`, () => {
    const { resolveTtrBucket } = harness().load('app/libs/priority/ttr.ts');
    assert.equal(resolveTtrBucket(fixture(1, { flagging_manja: flag }), now).bucket, 'reguler');
  });
}

test('HVC assurance tickets are regular candidates in both summary and drilldown', async () => {
  const app = harness([fixture(1, { jenis_tiket_2: 'HVC', customer_type: 'HVC_DIAMOND' })]);
  const data = await requestTickets(app, 'branch=PKL&kind=reguler&bucket=diamond_vvip');
  const summary = await app.load('app/libs/priority/queries.ts').queryAllPrioritySummary();
  assert.deepEqual(data.rows.map((row) => row.id_ticket), [1]);
  assert.equal(summary.branches.PKL.reguler_ttr.diamond_vvip.all, 1);
});

test('legacy closed state remains accepted for close HI drilldown', async () => {
  const app = harness([fixture(1), fixture(2, { status: 'CLOSED' })]);
  const data = await requestTickets(app, 'branch=PKL&kind=reguler&subKind=close_hi&state=closed');
  assert.deepEqual(data.rows.map((row) => row.id_ticket), [2]);
});

test('closed HI evidence does not expose a running TTR after resolution', async () => {
  const app = harness([fixture(1, {
    status: 'CLOSED', customer_type: 'HVC_DIAMOND', reported_date_dt: '2026-11-02 01:00:00',
    resolve_date: '2026-11-02 02:00:00',
  })]);
  const data = await requestTickets(app, 'branch=PKL&kind=reguler&subKind=close_hi');
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].evidence.kind, 'close_hi');
  assert.equal(data.rows[0].evidence.ttr_state, undefined);
  assert.equal(data.rows[0].evidence.remaining_ms, undefined);
});

test('an admin without eligible branches receives 403 before loading branch data', async () => {
  const app = harness([], [], { id_user: 2, role: 'admin' });
  const { GET } = app.load('app/api/priority/tickets/route.ts');
  const response = await GET({ nextUrl: new URL('http://localhost/api/priority/tickets?branch=PKL&kind=reguler') });
  assert.equal(response.status, 403);
  assert.deepEqual(app.branchIds, []);
});

test('every summary cell matches its corresponding pure drilldown selection', () => {
  const { summarizePriorityBranch, selectPriorityRows } = harness().load('app/libs/priority/model.ts');
  const rows = [fixture(1), fixture(2, { reported_date_dt: '2026-10-31 23:00:00' }), fixture(3, { reported_date_dt: '2026-10-31 10:00:00' }),
    fixture(4, { customer_type: 'HVC_DIAMOND' }), fixture(5, { customer_type: 'HVC_PLATINUM' }), fixture(6, { flagging_manja: 'P1' }), fixture(7, { status: 'CLOSED' }),
    ...['SQM', 'UNSPEC'].flatMap((jenis_tiket_2, index) => [fixture(10 + index, { jenis_tiket_2, tickets_30d: 2, reg_hvc_30d: 0 }), fixture(20 + index, { jenis_tiket_2, last_reg_hvc_incident: 'INC99' })])];
  const summary = summarizePriorityBranch('PKL', 'PEKALONGAN', rows, now);
  const count = (selection) => selectPriorityRows(rows, selection, now).length;
  for (const kind of ['reguler', 'sqm', 'underspec']) assert.equal(summary.card[`${kind}_open`], count({ kind }));
  for (const bucket of ['diamond_vvip', 'platinum', 'manja', 'reguler']) {
    for (const state of ['all', 'within', 'over']) assert.equal(summary.reguler_ttr[bucket][state], count({ kind: 'reguler', bucket, state }));
  }
  for (const subKind of ['open_hi', 'close_hi']) assert.equal(summary.reguler_summary[subKind], count({ kind: 'reguler', subKind }));
  for (const kind of ['sqm', 'underspec']) {
    for (const subKind of ['disruption', 'gaul']) assert.equal(summary.sqm_underspec[`${kind}_${subKind}`], count({ kind, subKind }));
  }
  assert.equal(summary.card.total_open, count({ kind: 'all' }));
  assert.equal(summary.reguler_summary.osla, count({ kind: 'reguler', state: 'over' }));
});

test('unknown deadlines remain in all counts but never within TTR', async () => {
  const app = harness([fixture(1, { reported_date_dt: null })]);
  const all = await requestTickets(app, 'branch=PKL&kind=reguler');
  const within = await requestTickets(app, 'branch=PKL&kind=reguler&state=within');
  assert.equal(all.meta.total, 1);
  assert.equal(all.meta.counts.within, 0);
  assert.equal(within.meta.total, 0);
});

test('summary export totals include tickets with unknown deadlines', async () => {
  const app = harness([fixture(1, { reported_date_dt: null })]);
  const { GET } = app.load('app/api/priority/export/route.ts');
  const response = await GET({ nextUrl: new URL('http://localhost/api/priority/export?scope=summary&branch=PKL') });
  assert.equal(response.status, 200);
  const lines = (await response.text()).trim().split('\n');
  assert.equal(lines[1].split(',')[13], '1');
  assert.equal(lines[2].split(',')[13], '1');
});

test('search pagination and ticket export keep the same complete filtered result', async () => {
  const rows = Array.from({ length: 135 }, (_, index) => fixture(index + 1, { customer_name: index < 35 ? 'Needle' : 'Other' }));
  const app = harness(rows);
  const data = await requestTickets(app, 'branch=PKL&kind=reguler&q=needle&page=2&limit=20');
  assert.equal(data.meta.total, 35);
  assert.equal(data.meta.has_more, false);
  assert.deepEqual(data.rows.map((row) => row.id_ticket), rows.slice(20, 35).map((row) => row.id_ticket));
  const { GET } = app.load('app/api/priority/export/route.ts');
  const response = await GET({ nextUrl: new URL('http://localhost/api/priority/export?scope=tickets&branch=PKL&kind=reguler&q=needle&page=2&limit=20') });
  assert.equal(response.status, 200);
  const csv = await response.text();
  assert.equal(csv.trim().split('\n').length, 36);
  assert.ok(csv.includes('"INC1"') && csv.includes('"INC35"') && !csv.includes('"INC36"'));
});

test('invalid parser values return 400 before reading branch data', async () => {
  for (const params of ['branch=BOGUS&kind=reguler', 'kind=other', 'kind=sqm&bucket=reguler', 'kind=reguler&state=closed', 'kind=reguler&bucket=other']) {
    const app = harness();
    const { GET } = app.load('app/api/priority/tickets/route.ts');
    const response = await GET({ nextUrl: new URL(`http://localhost/api/priority/tickets?${params}`) });
    assert.equal(response.status, 400, params);
    assert.deepEqual(app.branchIds, []);
  }
});
