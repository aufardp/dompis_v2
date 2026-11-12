const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('@prisma/client');
const { createHarness } = require('./helpers/sync-test-harness.cjs');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const cursor = { idColumn: null, modifiedColumn: null, createdAtColumn: null, strategy: 'snapshot', columns: [] };
const emptyResult = () => ({ processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] });
const writerStub = { withTicketRawWriterLock: fn => fn(new AbortController().signal) };

test('unchanged legacy ingestion updates freshness without resending the raw payload', async t => {
  const previous = process.env.TICKET_SYNC_REVISIONS_ENABLED;
  process.env.TICKET_SYNC_REVISIONS_ENABLED = 'false';
  t.after(() => previous === undefined ? delete process.env.TICKET_SYNC_REVISIONS_ENABLED : process.env.TICKET_SYNC_REVISIONS_ENABLED = previous);
  const writes = [];
  let existing;
  let checkpoints = 0;
  const tx = {
    $queryRawUnsafe: async () => [existing],
    $executeRaw: async (parts, ...values) => { writes.push(Prisma.sql(parts, ...values)); return 1; },
    ingestion_checkpoint: { upsert: async () => { checkpoints++; } },
  };
  const harness = createHarness({
    '@/app/libs/prisma': { prisma: { $transaction: fn => fn(tx) } },
    '@/lib/ingestion/raw-writer-lock': writerStub,
  });
  const payload = { Incident: 'INC90000001', Status: 'OPEN', Workzone: 'PKL', Summary: 'Unchanged payload' };
  const { normalizeExternalRow, computeSourceHash } = harness.load('lib/ingestion/normalizer.ts');
  existing = { incident: payload.Incident, sourceHash: computeSourceHash(normalizeExternalRow(payload, 'piloting_tickets')), status: 'OPEN', syncVersion: 4, sourceUpdatedAt: null, sourceTable: 'piloting_tickets' };
  const result = emptyResult();
  await harness.load('lib/ingestion/index.ts').processRawRows([payload], 'piloting_tickets', 'replay', cursor, result);
  assert.equal(result.skipped, 1);
  assert.equal(result.updated, 0);
  assert.equal(checkpoints, 1);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /UPDATE ticket_raw SET lastSeenAt/);
  assert.match(writes[0].sql, /lastSeenAt IS NULL OR lastSeenAt </);
  assert.ok(!writes[0].values.includes(payload.Summary));
});

test('retry logs preserve the timeout cause and distinguish the writer queue from SQL', async () => {
  const warnings = [];
  const { __test } = createHarness({
    '@/lib/observability/logger': { logger: { info() {}, warn: (message, context) => warnings.push({ message, context }), error() {} } },
    '@/lib/ingestion/raw-writer-lock': writerStub,
  }, { 'lib/ingestion/index.ts': ['withRetry', 'classifyTransientError'] }).load('lib/ingestion/index.ts');
  const error = Object.assign(new Error('Timed out waiting for ticket_raw_writer after 120000ms'), { code: 'TICKET_RAW_WRITER_LOCK_TIMEOUT', waitMs: 120000, blockingOwner: 'another-worker', queuePosition: 2 });
  assert.equal(__test.classifyTransientError(error), 'writer_lock_timeout');
  assert.equal(__test.classifyTransientError(new Error('Timed out during query execution.')), 'query_timeout');
  assert.equal(__test.classifyTransientError(Object.assign(new Error('Transaction already closed'), { code: 'P2028' })), 'transaction_timeout');
  let calls = 0;
  await __test.withRetry(async () => { if (calls++ === 0) throw error; return true; }, { retryMax: 1 });
  assert.equal(warnings[0].context.errorMessage, error.message);
  assert.equal(warnings[0].context.errorCode, error.code);
  assert.equal(warnings[0].context.waitMs, 120000);
  assert.ok(Number.isFinite(warnings[0].context.operationDurationMs));
});

test('fresh batches resume between backlog slices and are acknowledged only after completion', async t => {
  const previous = { enabled: process.env.PROJECTION_ENABLED, revisions: process.env.TICKET_SYNC_REVISIONS_ENABLED };
  process.env.PROJECTION_ENABLED = 'true';
  process.env.TICKET_SYNC_REVISIONS_ENABLED = 'false';
  t.after(() => {
    for (const [name, value] of [['PROJECTION_ENABLED', previous.enabled], ['TICKET_SYNC_REVISIONS_ENABLED', previous.revisions]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const calls = [];
  const acknowledgements = [];
  const acknowledgedIds = new Set();
  const freshCursor = { importedAt: new Date('2026-11-11T01:00:00Z'), ticketRawId: 'fresh-1' };
  const state = { running: false, consecutiveErrors: 0 };
  const filename = path.resolve(__dirname, '../worker-projection.ts');
  const source = readFileSync(filename, 'utf8').replace(/startWorker\(\)\.catch\([\s\S]*$/, '') + '\nasync function runTestPump() { pendingProjectionRun = true; await drainProjectionQueue("test"); }';
  const { __test } = createHarness({
    'dotenv/config': {},
    '@/app/libs/prisma': { prisma: { projection_request: {
      findMany: async () => [{ id: 1n, syncBatchId: 'fresh-batch' }, { id: 2n, syncBatchId: null }].filter(request => !acknowledgedIds.has(request.id)),
      updateMany: async ({ where }) => { acknowledgements.push({ ids: where.id.in, at: calls.length }); where.id.in.forEach(id => acknowledgedIds.add(id)); },
    } } },
    '@/lib/projection': { runProjection: async (_signal, options) => {
      calls.push(options);
      return { processed: 1, inserted: 1, updated: 0, skipped: 0, failed: 0, retried: 0,
        checkpoint: {}, ...(calls.length === 1 ? { continuation: freshCursor } : {}) };
    } },
    '@/lib/workers/task-runner': {
      createTaskState: () => state,
      parsePositiveInt: (value, fallback) => Number(value) || fallback,
      shouldRunWithCircuitBreaker: () => true,
      withCancellableTimeout: () => { const controller = new AbortController(); return { controller, signal: controller.signal, cancel() {} }; },
      withTaskLock: async (_key, _ttl, fn) => { await fn({ fencingToken: 1 }); return 'acquired'; },
      nowWIB: () => 'test',
    },
    '@/lib/observability/config-validator': {},
    '@/lib/observability/slo-tracker': { recordRun: async () => {} },
  }, { 'worker-projection.ts': ['runTestPump'] }, { 'worker-projection.ts': source }).load('worker-projection.ts');
  await __test.runTestPump();
  assert.deepEqual(calls.map(options => options.syncBatchId || 'backlog'), ['fresh-batch', 'backlog', 'fresh-batch', 'backlog']);
  assert.equal(calls[0].preserveCheckpointCursor, true);
  assert.deepEqual(calls[2].after, freshCursor);
  assert.deepEqual(acknowledgements, [{ ids: [2n], at: 2 }, { ids: [1n], at: 3 }]);
  assert.equal(state.consecutiveErrors, 0);
});

test('a failed fresh batch remains unacknowledged and does not stop backlog projection', async t => {
  const previous = process.env.PROJECTION_ENABLED;
  process.env.PROJECTION_ENABLED = 'true';
  t.after(() => previous === undefined ? delete process.env.PROJECTION_ENABLED : process.env.PROJECTION_ENABLED = previous);
  const calls = [];
  let acknowledged = false;
  const state = { running: false, consecutiveErrors: 0 };
  const source = readFileSync(path.resolve(__dirname, '../worker-projection.ts'), 'utf8').replace(/startWorker\(\)\.catch\([\s\S]*$/, '');
  const { __test } = createHarness({
    'dotenv/config': {},
    '@/app/libs/prisma': { prisma: { projection_request: {
      findMany: async () => [{ id: 1n, syncBatchId: 'failed-batch' }],
      updateMany: async () => { acknowledged = true; },
    } } },
    '@/lib/ingestion/sync-state': { isRevisionSyncEnabled: () => false },
    '@/lib/projection': { runProjection: async (_signal, options) => {
      calls.push(options);
      if (options.syncBatchId) throw new Error('bad fresh batch');
      return { processed: 0, failed: 0, checkpoint: {} };
    } },
    '@/lib/workers/task-runner': {
      createTaskState: () => state, parsePositiveInt: (_value, fallback) => fallback,
      shouldRunWithCircuitBreaker: () => true, nowWIB: () => 'test',
      withCancellableTimeout: () => { const controller = new AbortController(); return { controller, signal: controller.signal, cancel() {} }; },
      withTaskLock: async (_key, _ttl, fn) => { await fn({ fencingToken: 1 }); return 'acquired'; },
    },
    '@/lib/observability/config-validator': {},
    '@/lib/observability/slo-tracker': { recordRun: async () => {} },
  }, { 'worker-projection.ts': ['runProjectionTask'] }, { 'worker-projection.ts': source }).load('worker-projection.ts');
  await __test.runProjectionTask('incremental');
  assert.deepEqual(calls.map(options => options.syncBatchId || 'backlog'), ['failed-batch', 'backlog']);
  assert.equal(acknowledged, false);
  assert.equal(state.consecutiveErrors, 0);
});
