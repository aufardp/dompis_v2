const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('@prisma/client');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

const now = new Date('2026-11-03T03:00:00Z');
const raw = {
  id_ticket: 'raw-1', incident: 'INC00000001', sourceTable: 'nossa',
  sourceHash: 'hash-2', syncVersion: 2, status: 'OPEN', syncBatchId: 'batch-2',
  importedAt: now, street_address: 'Source address', resolve_date: null,
};
const existing = {
  id_ticket: 1, incident: raw.incident, teknisi_user_id: 99,
  alamat: 'Technician address', status: 'OPEN', status_update: 'assigned',
  closed_at: null,
};

test('bulk projection preserves the current technician address', () => {
  const { buildProjectionUpsert, __test } = createHarness({}, {
    'lib/projection/index.ts': ['getTicketRow'],
  }).load('lib/projection/index.ts');
  const plan = buildProjectionUpsert(raw, existing, null, null, now, now);
  const row = __test.getTicketRow({ raw, ...plan, action: 'updated' });
  assert.equal(row.alamat, existing.alamat);
});

test('a source reopen clears the previous closure for an unassigned ticket', () => {
  const { buildProjectionUpsert } = createHarness().load('lib/projection/index.ts');
  const plan = buildProjectionUpsert(raw, {
    ...existing, teknisi_user_id: null, status: 'CLOSED', status_update: 'close', closed_at: now,
  }, null, null, now, now);
  assert.equal(plan.upsert.update.status, 'OPEN');
  assert.equal(plan.upsert.update.status_update, 'open');
  assert.equal(plan.upsert.update.closed_at, null);
  assert.equal(plan.upsert.update.resolve_date, null);
});

test('raw and extension writes use the same transaction and roll back together', async () => {
  let globalWrites = 0;
  let rolledBack = false;
  const writes = [];
  const tx = {
    $queryRawUnsafe: async () => [],
    $queryRaw: async () => [],
    $executeRaw: async (parts, ...values) => {
      const sql = Prisma.sql(parts, ...values).sql;
      writes.push(sql);
      if (sql.includes('INSERT INTO `ticket_raw_bridge_ext`')) throw new Error('fixture extension failure');
      return 1;
    },
    ingestion_checkpoint: { upsert: async () => {} },
    ingestion_quarantine: { createMany: async () => {} },
  };
  const prisma = {
    $queryRawUnsafe: async () => [],
    $transaction: async (fn) => {
      try { return await fn(tx); }
      catch (error) { rolledBack = true; throw error; }
    },
  };
  const { processRawRows } = createHarness({
    '@/app/libs/prisma': { prisma, prismaBulk: { $executeRaw: async () => { globalWrites++; return 1; } } },
  }).load('lib/ingestion/index.ts');
  const result = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] };
  await assert.rejects(() => processRawRows([{
    Incident: raw.incident, Status: 'OPEN', Workzone: 'PKL',
    Last_Update_Ticket: '2026-11-03 10:00:00', C_DESCRIPTION_SERVICEID: 'fixture',
  }], 'nossa', 'batch', {
    idColumn: null, modifiedColumn: null, createdAtColumn: null, strategy: 'snapshot', columns: [],
  }, result), /fixture extension failure/);
  assert.equal(globalWrites, 0);
  assert.equal(rolledBack, true);
  assert.ok(writes.some(sql => sql.includes('INSERT INTO `ticket_raw`')));
});

test('a cache computation started before a revision change cannot populate the new revision', async () => {
  const values = new Map([['cache:tickets:version', '1']]);
  const redis = {
    get: async key => values.get(key) ?? null,
    setex: async (key, _ttl, value) => values.set(key, value),
  };
  const { getOrSetCache } = createHarness({
    '@/lib/redis': { __esModule: true, default: redis, redis, ensureRedisReady: async () => true, isRedisReady: () => true },
    '@/lib/sql/query-gate': { withQueryGate: fn => fn() },
  }).load('lib/cache.ts');
  await getOrSetCache('tickets:test', async () => {
    values.set('cache:tickets:version', '2');
    return 'old';
  });
  assert.equal(await getOrSetCache('tickets:test', async () => 'new'), 'new');
});

test('the existing ingestion and projection guard suites pass with isolated dependencies', () => {
  const harness = createHarness();
  harness.load('scripts/test-phase3-ingestion.ts');
  harness.load('scripts/test-phase4-projection.ts');
});

test('a dirty dashboard refreshes in the background before its long TTL expires', async () => {
  const previous = process.env.TICKET_SYNC_REVISIONS_ENABLED;
  process.env.TICKET_SYNC_REVISIONS_ENABLED = 'true';
  const values = new Map([
    ['dashboard:test', JSON.stringify({ __swr: true, storedAt: Date.now() - 31000, data: 'old' })],
    ['cache:dashboard:dirtyAt', String(Date.now())],
  ]);
  const redis = {
    get: async key => values.get(key) ?? null,
    setex: async (key, _ttl, value) => values.set(key, value),
    publish: async () => 1,
  };
  try {
    const { getOrSetCacheSwr } = createHarness({
      '@/lib/redis': { __esModule: true, default: redis, redis, ensureRedisReady: async () => true },
      '@/lib/sql/query-gate': { withQueryGate: fn => fn() },
    }).load('lib/cache.ts');
    assert.equal(await getOrSetCacheSwr('dashboard:test', async () => 'new', 300), 'old');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await getOrSetCacheSwr('dashboard:test', async () => 'new', 300), 'new');
  } finally {
    if (previous === undefined) delete process.env.TICKET_SYNC_REVISIONS_ENABLED;
    else process.env.TICKET_SYNC_REVISIONS_ENABLED = previous;
  }
});

test('the Bridge scheduler enqueues Nossa independently of the Piloting table list', async t => {
  const previous = process.env.BRIDGE_JOB_INGESTION_ENABLED;
  process.env.BRIDGE_JOB_INGESTION_ENABLED = 'true';
  t.after(() => previous === undefined ? delete process.env.BRIDGE_JOB_INGESTION_ENABLED : process.env.BRIDGE_JOB_INGESTION_ENABLED = previous);
  const calls = [];
  let state = null;
  const queue = {
    getJob: async () => state ? { getState: async () => state, remove: async () => { state = null; } } : null,
    add: async (...args) => { calls.push(args); state = 'waiting'; },
  };
  const { enqueueScheduledBridgeScan } = createHarness({
    '@/lib/external-db/qosmic-bridge/bridge-queue': { ingestionQueue: queue },
  }).load('lib/external-db/qosmic-bridge/scheduler.ts');
  await enqueueScheduledBridgeScan('nossa');
  await enqueueScheduledBridgeScan('nossa');
  assert.equal(calls.length, 1);
  state = 'completed';
  await enqueueScheduledBridgeScan('nossa');
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'ingest-nossa');
});

test('completed historical windows are not requeued after completed jobs have been removed', async t => {
  const previous = process.env.BRIDGE_JOB_BACKFILL_ENABLED;
  process.env.BRIDGE_JOB_BACKFILL_ENABLED = 'true';
  t.after(() => previous === undefined ? delete process.env.BRIDGE_JOB_BACKFILL_ENABLED : process.env.BRIDGE_JOB_BACKFILL_ENABLED = previous);
  const calls = [];
  let checkpoints = [];
  const { enqueueHistoricalSweep } = createHarness({
    '@/app/libs/prisma': { prisma: { ingestion_checkpoint: { findMany: async () => checkpoints } } },
    '@/lib/external-db/qosmic-bridge/bridge-queue': { backfillQueue: { getJob: async () => null, add: async (...args) => calls.push(args) } },
  }).load('lib/external-db/qosmic-bridge/scheduler.ts');
  await enqueueHistoricalSweep();
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => !call[2].jobId.includes(':')));
  checkpoints = calls.map(call => ({ tableName: call[1].checkpointKey, status: 'success' }));
  calls.length = 0;
  await enqueueHistoricalSweep();
  assert.equal(calls.length, 0);
});

test('the revision worker does not depend on a Redis task lock', async t => {
  const previous = process.env.TICKET_SYNC_REVISIONS_ENABLED;
  process.env.TICKET_SYNC_REVISIONS_ENABLED = 'true';
  t.after(() => previous === undefined ? delete process.env.TICKET_SYNC_REVISIONS_ENABLED : process.env.TICKET_SYNC_REVISIONS_ENABLED = previous);
  const filename = path.resolve(__dirname, '../worker-projection.ts');
  const source = readFileSync(filename, 'utf8').replace(/startWorker\(\)\.catch\([\s\S]*$/, '');
  const { __test } = createHarness({
    'dotenv/config': {},
    '@/lib/workers/task-runner': { createTaskState: () => ({ running: false }), parsePositiveInt: (_value, fallback) => fallback, withTaskLock: async () => { throw new Error('Redis lock was used'); } },
    '@/lib/observability/config-validator': {},
    '@/lib/observability/slo-tracker': {},
  }, { 'worker-projection.ts': ['withProjectionLock'] }, { 'worker-projection.ts': source }).load('worker-projection.ts');
  let called = false;
  assert.equal(await __test.withProjectionLock(async () => { called = true; }, new AbortController()), 'acquired');
  assert.equal(called, true);
});
