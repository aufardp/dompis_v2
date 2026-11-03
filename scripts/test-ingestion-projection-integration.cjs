const assert = require('node:assert/strict');
const { test, before, beforeEach, after } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

const url = process.env.SYNC_TEST_DATABASE_URL || 'mysql://root:dompis_sync_test@127.0.0.1:13316/dompis_sync_test';
const parsed = new URL(url);
assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.port === '13316' && parsed.pathname === '/dompis_sync_test', 'Integration tests require the isolated dompis_sync_test database on port 13316');
process.env.TICKET_SYNC_REVISIONS_ENABLED = 'true';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const incident = 'INC90000001';
const cursor = { idColumn: null, modifiedColumn: null, createdAtColumn: null, strategy: 'snapshot', columns: [] };
const fixture = (overrides = {}) => ({
  Incident: incident, Status: 'OPEN', Workzone: 'PKL', Summary: 'Original',
  Reported_Date: '2026-11-03 08:00:00', Last_Update_Ticket: '2026-11-03 09:00:00',
  C_DESCRIPTION_SERVICEID: 'Original extension', ...overrides,
});

function app(client = prisma, extra = {}, expose = {}) {
  return createHarness({
    '@/app/libs/prisma': { prisma: client, prismaBulk: client },
    '@/lib/classify-jenis-vlookup': {
      batchClassifyJenisFromVlookup: async rows => rows.map(() => ({ jenis_tiket_1: 'ASSURANCE', jenis_tiket_2: 'REG' })),
      refreshVlookupCache: async () => {},
    },
    ...extra,
  }, expose);
}

async function ingest(harness, payload, source = 'nossa') {
  const result = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] };
  await harness.load('lib/ingestion/index.ts').processRawRows([payload], source, 'integration-batch', cursor, result);
  return result;
}

before(async () => {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS ticket_source_snapshot');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS ticket_sync_state');
  const sql = readFileSync(path.join(__dirname, '../prisma/migrations/20261103000000_ticket_sync_revisions/migration.sql'), 'utf8');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
});

beforeEach(async () => {
  for (const model of ['ticket_projection_log', 'ticket_raw_bridge_ext', 'ticket_source_snapshot', 'ticket_sync_state', 'status_refresh_ticket_state', 'ticket_raw_finalized', 'ticket', 'ticket_raw', 'ingestion_quarantine', 'ingestion_checkpoint', 'ticket_projection_checkpoint']) {
    await prisma[model].deleteMany();
  }
});
after(() => prisma.$disconnect());

test('replay keeps one raw revision and one extension snapshot', async () => {
  const harness = app();
  assert.equal((await ingest(harness, fixture())).inserted, 1);
  for (let i = 0; i < 5; i++) assert.equal((await ingest(harness, fixture())).skipped, 1);
  assert.equal(await prisma.ticket_raw.count(), 1);
  assert.equal(await prisma.ticket_raw_bridge_ext.count(), 1);
  const state = await prisma.ticket_sync_state.findUnique({ where: { incident } });
  assert.equal(state.rawRevision, 1n);
  assert.equal(state.pending, true);
});

test('an unchanged legacy raw row is seeded for projection on its first revision scan', async () => {
  const harness = app();
  await ingest(harness, fixture());
  const before = await prisma.ticket_raw.findUnique({ where: { incident } });
  await prisma.ticket_source_snapshot.deleteMany();
  await prisma.ticket_sync_state.deleteMany();
  assert.equal((await ingest(harness, fixture())).skipped, 1);
  const state = await prisma.ticket_sync_state.findUnique({ where: { incident } });
  assert.equal(state.rawRevision, 1n);
  assert.equal(state.pending, true);
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).syncVersion, before.syncVersion);
  const result = await harness.load('lib/projection/index.ts').runProjection();
  assert.equal(result.inserted, 1);
  assert.equal(result.pending, 0);
  const checkpoint = await prisma.ticket_projection_checkpoint.findUnique({ where: { name: 'ticket_raw_to_ticket' } });
  assert.equal(checkpoint.inserted, 1);
  assert.equal(checkpoint.status, 'success');
});

test('a companion write failure rolls back raw, snapshot, state and checkpoint', async () => {
  const client = new Proxy(prisma, { get(target, key) {
    if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, field) {
      if (field === '$executeRaw') return async (parts, ...values) => {
        if (Prisma.sql(parts, ...values).sql.includes('INSERT INTO `ticket_raw_bridge_ext`')) throw new Error('fixture extension failure');
        return inner.$executeRaw(parts, ...values);
      };
      const value = inner[field];
      return typeof value === 'function' ? value.bind(inner) : value;
    } })), options);
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(() => ingest(app(client), fixture()), /fixture extension failure/);
  for (const model of ['ticket_raw', 'ticket_raw_bridge_ext', 'ticket_source_snapshot', 'ticket_sync_state', 'ingestion_checkpoint']) {
    assert.equal(await prisma[model].count(), 0, model);
  }
  await ingest(app(), fixture());
  assert.equal(await prisma.ticket_raw_bridge_ext.count(), 1);
});

test('concurrent older and newer snapshots converge on the newer source version', async () => {
  await Promise.all([
    ingest(app(), fixture()),
    ingest(app(), fixture({ Summary: 'Newer', Last_Update_Ticket: '2026-11-03 09:01:00' })),
  ]);
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).summary, 'Newer');
});

test('same-timestamp source conflict is quarantined rather than silently overwriting', async () => {
  const harness = app();
  await ingest(harness, fixture());
  const result = await ingest(harness, fixture({ Summary: 'Ambiguous' }));
  assert.equal(result.quarantined, 1);
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).summary, 'Original');
});

test('explicit NULL clears a QOSMIC value and an allowed Piloting complement is retained', async () => {
  const harness = app();
  await ingest(harness, fixture({ C_RESOLVE_DATE: '2026-11-03 08:30:00' }));
  await ingest(harness, { incident, status: 'OPEN', date_modified: '2026-11-03 09:00:00', contact_phone: '0800123', resolve_date: '2026-11-03 08:30:00' }, 'piloting_tickets');
  await ingest(harness, fixture({ C_RESOLVE_DATE: null, Last_Update_Ticket: '2026-11-03 09:02:00' }));
  const row = await prisma.ticket_raw.findUnique({ where: { incident } });
  assert.equal(row.resolve_date, null);
  assert.equal(row.contact_phone, '0800123');
  assert.equal(row.sourceTable, 'nossa');
});

test('projection processes committed pending work without Redis or a timestamp cursor', async () => {
  const harness = app();
  await ingest(harness, fixture());
  const { runPendingProjection } = harness.load('lib/projection/pending.ts');
  const result = await runPendingProjection();
  assert.equal(result.inserted, 1, JSON.stringify(result));
  const state = await prisma.ticket_sync_state.findUnique({ where: { incident } });
  assert.equal(state.appliedRevision, state.rawRevision);
  assert.equal(state.pending, false);
  assert.equal(state.effectsPending, true);
  assert.equal((await prisma.ticket.findUnique({ where: { incident } })).summary, 'Original');
});

test('a prepared old revision cannot overwrite a newer pending revision', async () => {
  const harness = app(prisma, {}, { 'lib/projection/pending.ts': ['applyPendingBatch'] });
  await ingest(harness, fixture());
  const pending = harness.load('lib/projection/pending.ts');
  const previous = await pending.fetchPendingRaw(10, {});
  await ingest(harness, fixture({ Summary: 'Latest', Last_Update_Ticket: '2026-11-03 09:03:00' }));
  assert.equal((await pending.__test.applyPendingBatch(previous)).length, 0);
  assert.equal(await prisma.ticket.count(), 0);
  await pending.runPendingProjection();
  assert.equal((await prisma.ticket.findUnique({ where: { incident } })).summary, 'Latest');
});

test('finalized incidents still receive corrections and source reopen', async () => {
  const harness = app();
  await ingest(harness, fixture({ Status: 'CLOSED' }), 'nossa_closed');
  await prisma.ticket_raw_finalized.create({ data: { incident } });
  const pending = harness.load('lib/projection/pending.ts');
  await pending.runPendingProjection();
  await ingest(harness, fixture({ Summary: 'Corrected', Last_Update_Ticket: '2026-11-03 09:04:00' }));
  await pending.runPendingProjection();
  const ticket = await prisma.ticket.findUnique({ where: { incident } });
  assert.equal(ticket.summary, 'Corrected');
  assert.equal(ticket.status, 'OPEN');
  assert.equal(ticket.status_update, 'open');
  assert.equal(ticket.closed_at, null);
});

test('manual reopen remains open while the same source snapshot is replayed', async () => {
  const harness = app();
  await ingest(harness, fixture({ Status: 'CLOSED' }), 'nossa_closed');
  const pending = harness.load('lib/projection/pending.ts');
  await pending.runPendingProjection();
  const raw = await prisma.ticket_raw.findUnique({ where: { incident } });
  await prisma.$transaction(async tx => {
    const sync = harness.load('lib/ingestion/sync-state.ts');
    await sync.lockTicketSyncState(tx, [incident]);
    await tx.ticket_sync_state.update({ where: { incident }, data: { manualReopenHash: raw.sourceHash } });
    await tx.ticket.update({ where: { incident }, data: { status_update: 'open', closed_at: null } });
    await sync.markProjectionPending(tx, [incident]);
  });
  await ingest(harness, fixture({ Status: 'CLOSED' }), 'nossa_closed');
  await pending.runPendingProjection();
  const ticket = await prisma.ticket.findUnique({ where: { incident } });
  assert.equal(ticket.status_update, 'open');
  assert.equal(ticket.closed_at, null);
});

test('reconciliation repairs a lost pending marker and missing ticket', async () => {
  const harness = app();
  await ingest(harness, fixture());
  await prisma.ticket_sync_state.update({ where: { incident }, data: { pending: false } });
  const result = await harness.load('lib/projection/reconcile-state.ts').reconcileProjectionState();
  assert.equal(result.repaired, 1);
  await harness.load('lib/projection/pending.ts').runPendingProjection();
  assert.equal(await prisma.ticket.count(), 1);
});

test('a failed cache notification remains durable and is retried', async () => {
  const harness = app();
  await ingest(harness, fixture());
  await harness.load('lib/projection/pending.ts').runPendingProjection();
  let publishes = 0;
  const redis = { set: async () => 'OK', publish: async () => { publishes++; throw new Error('fixture publish failure'); } };
  const effects = app(prisma, { '@/lib/redis': { isRedisReady: () => true, redis } }).load('lib/projection/effects.ts');
  await assert.rejects(() => effects.flushProjectionEffects(), /fixture publish failure/);
  assert.equal((await prisma.ticket_sync_state.findUnique({ where: { incident } })).effectsPending, true);
  redis.publish = async () => { publishes++; return 1; };
  await effects.flushProjectionEffects();
  assert.equal((await prisma.ticket_sync_state.findUnique({ where: { incident } })).effectsPending, false);
  assert.equal(publishes, 2);
});

test('explicit NULL also clears an extension while absent legacy fields are preserved', async () => {
  const harness = app();
  await prisma.ticket_raw.create({ data: { incident, sourceTable: 'nossa', sourceHash: 'legacy', contact_phone: 'Legacy phone', summary: 'Legacy' } });
  await ingest(harness, fixture());
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).contact_phone, 'Legacy phone');
  await ingest(harness, fixture({ C_DESCRIPTION_SERVICEID: null, Last_Update_Ticket: '2026-11-03 09:05:00' }));
  assert.equal((await prisma.ticket_raw_bridge_ext.findUnique({ where: { incident } })).c_description_serviceid, null);
});

test('a poison ticket stays pending while a healthy ticket in the same batch succeeds', async () => {
  const harness = app(prisma, { '@/lib/classify-jenis-vlookup': {
    batchClassifyJenisFromVlookup: async rows => rows.map(row => ({ jenis_tiket_1: row.service_no === 'POISON' ? 'X'.repeat(300) : 'ASSURANCE', jenis_tiket_2: 'REG' })),
  } });
  await ingest(harness, fixture({ Service_No: 'POISON' }));
  const healthy = 'INC90000002';
  await ingest(harness, fixture({ Incident: healthy, Service_No: '123456' }));
  const result = await harness.load('lib/projection/pending.ts').runPendingProjection();
  assert.equal(result.failed, 1);
  assert.equal(await prisma.ticket.count(), 1);
  assert.equal((await prisma.ticket.findFirst()).incident, healthy);
  const state = await prisma.ticket_sync_state.findUnique({ where: { incident } });
  assert.equal(state.pending, true);
  assert.equal(state.appliedRevision, 0n);
  assert.ok(state.lastError);
});

test('an older notification acknowledgment cannot erase a new notification', async () => {
  const harness = app();
  await ingest(harness, fixture());
  await harness.load('lib/projection/pending.ts').runPendingProjection();
  const redis = {
    set: async () => 'OK',
    publish: async () => {
      await prisma.ticket_sync_state.update({ where: { incident }, data: { effectsRevision: { increment: 1 }, effectsPending: true } });
      return 1;
    },
  };
  await app(prisma, { '@/lib/redis': { redis, isRedisReady: () => true } }).load('lib/projection/effects.ts').flushProjectionEffects();
  assert.equal((await prisma.ticket_sync_state.findUnique({ where: { incident } })).effectsPending, true);
});

test('a rejected ingestion row is quarantined without blocking healthy rows', async () => {
  const healthy = 'INC90000002';
  const client = new Proxy(prisma, { get(target, key) {
    if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, field) {
      if (field === '$executeRaw') return async (parts, ...values) => {
        const query = Prisma.sql(parts, ...values);
        if (query.sql.includes('INSERT INTO `ticket_raw`') && query.values.includes(incident)) throw new Error('1406 Data too long fixture');
        return inner.$executeRaw(parts, ...values);
      };
      const value = inner[field];
      return typeof value === 'function' ? value.bind(inner) : value;
    } })), options);
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const result = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] };
  await app(client).load('lib/ingestion/index.ts').processRawRows([fixture(), fixture({ Incident: healthy })], 'nossa', 'isolated', cursor, result);
  assert.equal(result.inserted, 1);
  assert.equal(result.quarantined, 1);
  assert.equal(await prisma.ticket_raw.count(), 1);
  assert.equal((await prisma.ticket_raw.findFirst()).incident, healthy);
  assert.equal(await prisma.ingestion_quarantine.count(), 1);
});

test('only missing open tickets are queued for confirmation and absence never closes them', async () => {
  const queued = [];
  const harness = app(prisma, {
    '@/lib/external-db/qosmic-bridge/bridge-queue': { interactiveQueue: { getJob: async () => null, add: async (...args) => queued.push(args) } },
  });
  await ingest(harness, fixture());
  await ingest(harness, fixture({ Incident: 'INC90000002' }));
  await prisma.ticket_raw.update({ where: { incident }, data: { lastSeenAt: new Date('2026-01-01T00:00:00Z') } });
  await prisma.ticket_source_snapshot.update({ where: { incident_sourceFamily: { incident, sourceFamily: 'qosmic' } }, data: { observedAt: new Date(0) } });
  const now = new Date();
  const { confirmMissingOpenTickets } = harness.load('lib/external-db/qosmic-bridge/missing-open.ts');
  assert.equal(await confirmMissingOpenTickets(now), 1);
  assert.equal(queued[0][1].incident, incident);
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).status, 'OPEN');
  await prisma.status_refresh_ticket_state.create({ data: { incident, lastCheckedAt: harness.load('lib/timezone.ts').nowWib() } });
  assert.equal(await confirmMissingOpenTickets(now), 0);
});

test('reconciliation projects legacy raw records without an imported timestamp', async () => {
  const harness = app();
  await prisma.ticket_raw.create({ data: { incident, sourceTable: 'nossa', summary: 'Legacy raw', status: 'OPEN' } });
  await harness.load('lib/projection/reconcile-state.ts').reconcileProjectionState();
  await harness.load('lib/projection/pending.ts').runPendingProjection();
  const ticket = await prisma.ticket.findUnique({ where: { incident } });
  assert.ok(ticket);
  assert.equal(ticket.summary, 'Legacy raw');
});

test('manual tickets are protected while their pending revision is acknowledged', async () => {
  const harness = app();
  await ingest(harness, fixture());
  await prisma.ticket.create({ data: { incident, summary: 'Manual content', is_manual: true } });
  await harness.load('lib/projection/pending.ts').runPendingProjection();
  assert.equal((await prisma.ticket.findUnique({ where: { incident } })).summary, 'Manual content');
  assert.equal((await prisma.ticket_sync_state.findUnique({ where: { incident } })).pending, false);
});

test('an expired Piloting supplement does not remain as current QOSMIC data', async () => {
  const harness = app();
  await ingest(harness, fixture());
  await ingest(harness, { incident, date_modified: '2026-11-03 09:00:00', contact_phone: 'Expired phone' }, 'piloting_tickets');
  await prisma.ticket_source_snapshot.update({ where: { incident_sourceFamily: { incident, sourceFamily: 'piloting_tickets' } }, data: { observedAt: new Date(0) } });
  await ingest(harness, fixture());
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).contact_phone, null);
});

test('notifications publish after the first committed sub-batch instead of waiting for the full run', async () => {
  const batch = Array.from({ length: 100 }, (_, i) => fixture({ Incident: `INC${92000000 + i}` }));
  const result = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] };
  await app().load('lib/ingestion/index.ts').processRawRows(batch, 'nossa', 'batch-notifications', cursor, result);
  const observedCounts = [];
  const redis = { set: async () => 'OK', publish: async () => { observedCounts.push(await prisma.ticket.count()); return 1; } };
  await app(prisma, { '@/lib/redis': { redis, isRedisReady: () => true } }).load('lib/projection/pending.ts').runPendingProjection();
  assert.equal(observedCounts[0], 50);
  assert.equal(await prisma.ticket.count(), 100);
});

test('a resource move with identical business data updates routing without incrementing the business revision', async () => {
  const harness = app();
  await ingest(harness, fixture(), 'nossa_closed');
  const before = await prisma.ticket_sync_state.findUnique({ where: { incident } });
  await ingest(harness, fixture(), 'nossa');
  assert.equal((await prisma.ticket_raw.findUnique({ where: { incident } })).sourceTable, 'nossa');
  assert.equal((await prisma.ticket_sync_state.findUnique({ where: { incident } })).rawRevision, before.rawRevision);
});
