const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { readFileSync } = require('node:fs');
const mysql = require('mysql2/promise');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

let db;
let harness;
const captured = [];
before(async () => {
  db = await mysql.createConnection({ host: '127.0.0.1', port: 13317, user: 'root', password: 'dompis_ticket_test', database: 'dompis_ticket_test', dateStrings: true });
  await db.query('DROP TABLE IF EXISTS ticket');
  await db.query(`CREATE TABLE ticket (
    id_ticket INT PRIMARY KEY AUTO_INCREMENT, incident VARCHAR(40),
    workzone VARCHAR(30), source_ticket VARCHAR(50), jenis_tiket_1 VARCHAR(100), jenis_tiket_2 VARCHAR(100),
    classification_flag VARCHAR(100), classification_path VARCHAR(100), sqm_update_reason VARCHAR(100), symptom VARCHAR(100),
    customer_segment VARCHAR(50), customer_type VARCHAR(50), status VARCHAR(50), status_update VARCHAR(50),
    sync_date DATE, closed_at DATETIME, reported_date VARCHAR(100), booking_date VARCHAR(100), pending_dompis VARCHAR(50),
    worklog_summary VARCHAR(100), needs_validation BOOLEAN DEFAULT FALSE,
    guarantee_status VARCHAR(30), ticket_id_gamas VARCHAR(100), flagging_manja VARCHAR(10)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const path of ['prisma/migrations/20260913070000_add_operational_bucket/migration.sql', 'prisma/migrations/20261015090000_preman_into_proactive_bucket/migration.sql']) {
    const sql = readFileSync(path, 'utf8').replace(/--[^\n]*/g, '');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.query(statement);
  }
  const fixtures = [
    ['CUSTOMER','REGULER','REGULER','OPEN',null,'DCS','TECHNICAL',null],
    ['PROACTIVE','PREMAN','PREMAN','OPEN',null,'DBS','TECHNICAL',null],
    ['PROACTIVE','other','UNSPEC','OPEN',null,'DCS','TECHNICAL',null],
    ['CUSTOMER','BILLING','BILLING','OPEN',null,'DCS','BILLING',null],
    ['PROACTIVE','SQM','SQM','OPEN',null,'DCS','TECHNICAL','updated'],
    ['CUSTOMER','REGULER','REGULER','OPEN','Z_PERMINTAAN_044','DCS','TECHNICAL',null],
    ['CUSTOMER','REGULER','REGULER','CLOSED',null,'DCS','TECHNICAL',null],
  ];
  for (const [source,j1,j2,status,classification,segment,flag,reason] of fixtures) {
    await db.query(`INSERT INTO ticket
      (incident,workzone,source_ticket,jenis_tiket_1,jenis_tiket_2,status,classification_path,customer_segment,classification_flag,sqm_update_reason,sync_date,closed_at,reported_date,guarantee_status,ticket_id_gamas,flagging_manja,booking_date)
      VALUES ('INC90000001','DMO',?,?,?,?,?,?,?,?,DATE_SUB(CURDATE(), INTERVAL 2 DAY),NOW(),'2026-11-01 08:00:00','guarantee','GAMAS1','P1',NULL)`,
    [source,j1,j2,status,classification,segment,flag,reason]);
  }
  const client = { $queryRawUnsafe: async (sql, ...params) => {
    captured.push({ sql, params });
    const [rows] = await db.query(sql, params.map(value => value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : value));
    return rows;
  } };
  harness = createHarness({
    '@/app/libs/prisma': client,
    '@/lib/cache': { getOrSetCache: async (_key, fn) => fn(), getOrSetCacheSwr: async (_key, fn) => fn() },
    '@/app/helpers/ticket.helpers': {
      getWorkzonesForUser: async () => ['DMO'],
      getBranchServiceAreaNames: async () => ['DMO'],
      resolveWorkzoneName: async value => value,
    },
  }, { 'app/libs/services/daily-ticket-table.ts': ['countFlaggingSummary'] });
});
after(async () => { if (db) await db.end(); });

test('MySQL bucket matrices, overview cards and paginated lists agree for every bucket including neutral', async () => {
  const { getKpiBucketSummaryMatrix, getTicketManagementOverviewSummary } = harness.load('app/libs/services/daily-ticket-kpi-matrix.ts');
  const { buildDailyTicketWhere, buildMainTableWhere, fetchTicketIdsBySql } = harness.load('app/libs/services/daily-ticket-where.ts');
  const matrix = await getKpiBucketSummaryMatrix('superadmin', 1);
  for (const bucket of Object.keys(matrix.all)) {
    const where = buildMainTableWhere(await buildDailyTicketWhere('superadmin', 1, { operationalBucket: [bucket] }));
    const page = await fetchTicketIdsBySql(where, { sort: 'desc', offset: 0, limit: 50, priorityToday: '2026-11-15' });
    assert.equal(page.rows.length, 1, bucket);
    assert.equal(matrix.all[bucket].total, page.rows.length, bucket);
  }
  const overview = await getTicketManagementOverviewSummary('superadmin', 1);
  assert.equal(overview.totals.total, 6);
  assert.equal(overview.cards.kpiCustomer.close, 1);
  assert.equal(overview.cards.nonTechnical.total, 1);
});

test('MySQL flagging aggregation deduplicates validation overlap and matches the existing dynamic flag rules', async () => {
  const { buildMainTableWhere, buildDailyTicketWhere } = harness.load('app/libs/services/daily-ticket-where.ts');
  const { buildSqlWhereClause, summarizeBucketRows } = harness.load('app/libs/services/daily-ticket-helpers.ts');
  const { __test } = harness.load('app/libs/services/daily-ticket-table.ts');
  const where = buildMainTableWhere(await buildDailyTicketWhere('superadmin', 1));
  const summary = await __test.countFlaggingSummary(where, where);
  const [sql, params] = buildSqlWhereClause(where);
  const [rows] = await db.query(`SELECT * FROM ticket WHERE ${sql}`, params);
  const baseline = summarizeBucketRows(rows);
  for (const key of ['ffgCount', 'gamasCount', 'p1Count', 'pPlusCount']) assert.equal(summary[key], baseline[key], key);
  assert.equal(summary.ffgCount, 6);
  const grouped = captured.findLast(item => item.sql.includes('GROUP BY booking_date, flagging_manja'));
  const [groups] = await db.query(grouped.sql, grouped.params);
  assert.equal(groups.length, 1);
  console.log(JSON.stringify({ flaggingMatchedTickets: rows.length, groupedRowsReturned: groups.length }));
});

test('MySQL segment lists match the matrix and workzone/branch scope remains enforced', async () => {
  const { getKpiBucketSummaryMatrix } = harness.load('app/libs/services/daily-ticket-kpi-matrix.ts');
  const { buildDailyTicketWhere, buildMainTableWhere, fetchTicketIdsBySql } = harness.load('app/libs/services/daily-ticket-where.ts');
  const matrix = await getKpiBucketSummaryMatrix('superadmin', 1);
  for (const dept of ['b2c', 'b2b']) {
    for (const bucket of Object.keys(matrix.all)) {
      const where = buildMainTableWhere(await buildDailyTicketWhere('superadmin', 1, { dept, operationalBucket: [bucket] }));
      const page = await fetchTicketIdsBySql(where, { sort: 'desc', offset: 0, limit: 50 });
      assert.equal(page.rows.length, matrix[dept][bucket].total, `${dept}:${bucket}`);
    }
  }
  const restricted = await buildDailyTicketWhere('admin', 9, { workzone: 'GBG', branchId: 1 });
  const page = await fetchTicketIdsBySql(buildMainTableWhere(restricted), { sort: 'desc', offset: 0, limit: 50 });
  assert.equal(page.rows.length, 0);
  const noIntersection = await buildDailyTicketWhere('superadmin', 1, { workzone: 'GBG', branchId: 1 });
  assert.equal((await fetchTicketIdsBySql(buildMainTableWhere(noIntersection), { sort: 'desc', offset: 0, limit: 50 })).rows.length, 0);
});

test('MySQL daily date ranges exclude rows after the selected end date', async () => {
  const [inserted] = await db.query(`INSERT INTO ticket (incident,workzone,source_ticket,jenis_tiket_1,jenis_tiket_2,status,classification_flag,reported_date)
    VALUES ('INC90000003','DMO','CUSTOMER','REGULER','REGULER','OPEN','TECHNICAL','2026-11-20 08:00:00')`);
  try {
    const { buildDailyTicketWhere, buildMainTableWhere, fetchTicketIdsBySql } = harness.load('app/libs/services/daily-ticket-where.ts');
    const where = buildMainTableWhere(await buildDailyTicketWhere('superadmin', 1, { startDate: '2026-11-01', endDate: '2026-11-02' }));
    const page = await fetchTicketIdsBySql(where, { sort: 'desc', offset: 0, limit: 50 });
    assert.equal(page.rows.length, 6);
    assert.ok(page.rows.every(row => row.id_ticket !== inserted.insertId));
  } finally {
    await db.query('DELETE FROM ticket WHERE id_ticket = ?', [inserted.insertId]);
  }
});

test('MySQL grouped flags preserve booking-date promotions and expiration', async () => {
  const { buildMainTableWhere, buildDailyTicketWhere } = harness.load('app/libs/services/daily-ticket-where.ts');
  const { buildSqlWhereClause, summarizeBucketRows } = harness.load('app/libs/services/daily-ticket-helpers.ts');
  const { __test } = harness.load('app/libs/services/daily-ticket-table.ts');
  const today = harness.load('lib/timezone.ts').todayWibDateForDb();
  const day = offset => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const bookings = [null, `${day(0)} 08:00:00`, `${day(0)} 18:00:00`, `${day(-1)} 08:00:00`, `${day(-3)} 08:00:00`, `${day(1)} 08:00:00`];
  for (let i = 0; i < bookings.length; i++) await db.query('UPDATE ticket SET booking_date = ?, flagging_manja = ? WHERE id_ticket = ?', [bookings[i], i % 2 ? 'P+' : 'P1', i + 1]);
  const where = buildMainTableWhere(await buildDailyTicketWhere('superadmin', 1));
  const summary = await __test.countFlaggingSummary(where, where);
  const [sql, params] = buildSqlWhereClause(where);
  const [rows] = await db.query(`SELECT * FROM ticket WHERE ${sql}`, params);
  const expected = summarizeBucketRows(rows);
  for (const key of ['ffgCount', 'gamasCount', 'p1Count', 'pPlusCount']) assert.equal(summary[key], expected[key], key);
  const matrix = await harness.load('app/libs/services/daily-ticket-kpi-matrix.ts').getKpiBucketSummaryMatrix('superadmin', 1);
  for (const key of ['p1Count', 'pPlusCount']) {
    assert.equal(Object.values(matrix.all).reduce((total, bucket) => total + bucket[key], 0), expected[key]);
  }
});

test('MySQL flagging benchmark keeps the result while reducing rows transferred', async () => {
  await db.query(`INSERT INTO ticket (incident,workzone,source_ticket,jenis_tiket_1,jenis_tiket_2,status,customer_segment,classification_flag,sync_date,guarantee_status,ticket_id_gamas,flagging_manja)
    SELECT 'INC90000002','DMO','CUSTOMER','REGULER','REGULER','OPEN','DCS','TECHNICAL',CURDATE(),'guarantee','GAMAS1','P1'
    FROM JSON_TABLE('[0,1,2,3,4,5,6,7,8,9]', '$[*]' COLUMNS (n INT PATH '$')) a
    CROSS JOIN JSON_TABLE('[0,1,2,3,4,5,6,7,8,9]', '$[*]' COLUMNS (n INT PATH '$')) b
    CROSS JOIN JSON_TABLE('[0,1,2,3,4,5,6,7,8,9]', '$[*]' COLUMNS (n INT PATH '$')) c
    CROSS JOIN JSON_TABLE('[0,1,2,3,4,5,6,7,8,9]', '$[*]' COLUMNS (n INT PATH '$')) d`);
  const { buildMainTableWhere, buildDailyTicketWhere } = harness.load('app/libs/services/daily-ticket-where.ts');
  const where = buildMainTableWhere(await buildDailyTicketWhere('superadmin', 1));
  const { buildSqlWhereClause, summarizeBucketRows } = harness.load('app/libs/services/daily-ticket-helpers.ts');
  const [whereSql, params] = buildSqlWhereClause(where);
  const select = `SELECT id_ticket, status, status_update, guarantee_status, ticket_id_gamas, flagging_manja, booking_date FROM ticket WHERE ${whereSql}`;
  const [[workboard], [validation]] = await Promise.all([db.query(select, params), db.query(select, params)]);
  const transferredBefore = workboard.length + validation.length;
  const unique = new Map([...workboard, ...validation].map(row => [row.id_ticket, row]));
  const oldResult = summarizeBucketRows([...unique.values()]);
  const current = harness.load('app/libs/services/daily-ticket-table.ts');
  const newResult = await current.__test.countFlaggingSummary(where, where);
  for (const key of ['ffgCount', 'gamasCount', 'p1Count', 'pPlusCount']) assert.equal(newResult[key], oldResult[key], key);
  const grouped = captured.findLast(item => item.sql.includes('GROUP BY booking_date, flagging_manja'));
  const [groups] = await db.query(grouped.sql, grouped.params);
  assert.ok(groups.length < transferredBefore / 100);
  console.log(JSON.stringify({ benchmark: 'flagging-transfer', transferredBefore, transferredAfter: groups.length, identicalCounts: true }));
});
