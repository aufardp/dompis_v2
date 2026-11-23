const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('@prisma/client');
const { createHarness } = require('./helpers/sync-test-harness.cjs');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

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
  const record = async (parts, ...values) => { writes.push(Prisma.sql(parts, ...values)); return 1; };
  const tx = {
    $queryRawUnsafe: async () => [existing],
    $executeRaw: record,
    ingestion_checkpoint: { upsert: async () => { checkpoints++; } },
  };
  const harness = createHarness({
    '@/app/libs/prisma': { prisma: { $transaction: fn => fn(tx), $executeRaw: record } },
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

test('recent unchanged rows do not issue a heartbeat UPDATE', async t => {
  const previous = process.env.TICKET_SYNC_REVISIONS_ENABLED;
  process.env.TICKET_SYNC_REVISIONS_ENABLED = 'false';
  t.after(() => previous === undefined ? delete process.env.TICKET_SYNC_REVISIONS_ENABLED : process.env.TICKET_SYNC_REVISIONS_ENABLED = previous);
  const writes = [];
  let existing;
  const record = async (parts, ...values) => { writes.push(Prisma.sql(parts, ...values)); return 1; };
  const tx = {
    $queryRawUnsafe: async () => [existing],
    $executeRaw: record,
    ingestion_checkpoint: { upsert: async () => {} },
  };
  const harness = createHarness({ '@/app/libs/prisma': { prisma: { $transaction: fn => fn(tx), $executeRaw: record } } });
  const payload = { Incident: 'INC90000001', Status: 'OPEN', Summary: 'Unchanged' };
  const { normalizeExternalRow, computeSourceHash } = harness.load('lib/ingestion/normalizer.ts');
  existing = { incident: payload.Incident, sourceHash: computeSourceHash(normalizeExternalRow(payload, 'piloting_tickets')), status: 'OPEN', syncVersion: 1, lastSeenAt: harness.load('lib/timezone.ts').nowWib() };
  const result = emptyResult();
  await harness.load('lib/ingestion/index.ts').processRawRows([payload], 'piloting_tickets', 'recent', cursor, result);
  assert.equal(result.skipped, 1);
  assert.equal(writes.length, 0);
});

test('a skipped priority row with a current projection log issues no write transaction', async () => {
  let transactions = 0;
  const { __test } = createHarness({ '@/app/libs/prisma': { prisma: { $transaction: async () => { transactions++; } } } }, {
    'lib/projection/index.ts': ['projectSubBatchAtomically'],
  }).load('lib/projection/index.ts');
  await __test.projectSubBatchAtomically([
    { action: 'skipped', projectionLogCurrent: true, raw: { id_ticket: 'raw-1' } },
  ], { id_ticket: 'raw-1' }, {}, { preserveCheckpointCursor: true });
  assert.equal(transactions, 0);
});

test('skipped backlog rows still advance the checkpoint without rewriting current logs', async () => {
  let logWrites = 0;
  let checkpoint;
  const tx = {
    $executeRaw: async () => { logWrites++; },
    ticket_projection_checkpoint: { update: async ({ data }) => { checkpoint = data; } },
  };
  const { __test } = createHarness({ '@/app/libs/prisma': { prisma: { $transaction: fn => fn(tx) } } }, {
    'lib/projection/index.ts': ['projectSubBatchAtomically'],
  }).load('lib/projection/index.ts');
  const raw = { id_ticket: 'raw-1', importedAt: new Date('2026-11-13T01:00:00Z') };
  await __test.projectSubBatchAtomically([{ action: 'skipped', projectionLogCurrent: true, raw }], raw, emptyResult(), {
    preserveCheckpointCursor: false, attempts: 0, syncBatchId: 'batch', preservedCheckpoint: {},
  });
  assert.equal(logWrites, 0);
  assert.equal(checkpoint.lastProjectedTicketRawId, raw.id_ticket);
});

test('structured logs preserve checkpoint dates and omit debug output by default', t => {
  const output = [];
  const previousLog = console.log;
  const previousLevel = process.env.LOG_LEVEL;
  console.log = line => output.push(JSON.parse(line));
  delete process.env.LOG_LEVEL;
  t.after(() => { console.log = previousLog; if (previousLevel === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previousLevel; });
  const { logger } = createHarness().load('lib/observability/logger.ts');
  logger.info('checkpoint', { cursor: { date: new Date('2026-11-13T01:00:00Z') }, token: 'sensitive' });
  logger.debug('writer lock');
  assert.equal(output[0].cursor.date, '2026-11-13T01:00:00.000Z');
  assert.equal(output[0].token, '[REDACTED]');
  assert.equal(output.length, 1);
  process.env.LOG_LEVEL = 'debug';
  logger.debug('writer lock');
  assert.equal(output.length, 2);
});

test('Redis becoming ready during connect does not leave a timeout listener behind', async () => {
  const redis = Object.assign(new EventEmitter(), { status: 'wait' });
  const { waitForRedisReady } = createHarness({ '@/lib/redis': {
    redis, connectRedis: async () => { redis.status = 'ready'; redis.emit('ready'); },
  } }).load('lib/workers/task-runner.ts');
  await waitForRedisReady(5);
  assert.equal(redis.listenerCount('ready'), 0);
});

test('validation cleanup writes only the selected closed ticket IDs', async () => {
  let selector;
  let update;
  const { __test } = createHarness({ '@/app/libs/prisma': { prisma: { ticket: {
    findMany: async options => { selector = options; return [{ id_ticket: 12 }, { id_ticket: 18 }]; },
    updateMany: async options => { update = options; return { count: 2 }; },
  } } } }, { 'lib/projection/index.ts': ['cleanupClosedValidationFlags'] }).load('lib/projection/index.ts');
  assert.equal(await __test.cleanupClosedValidationFlags(), 2);
  assert.equal(selector.take, 100);
  assert.deepEqual(update.where.id_ticket.in, [12, 18]);
  assert.equal(update.where.needs_validation, true);
  assert.deepEqual(update.where.status, selector.where.status);
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
  const previous = {
    enabled: process.env.PROJECTION_ENABLED,
    revisions: process.env.TICKET_SYNC_REVISIONS_ENABLED,
    continuationDelay: process.env.PROJECTION_CONTINUATION_DELAY_MS,
  };
  process.env.PROJECTION_ENABLED = 'true';
  process.env.TICKET_SYNC_REVISIONS_ENABLED = 'false';
  process.env.PROJECTION_CONTINUATION_DELAY_MS = '1';
  t.after(() => {
    for (const [name, value] of [['PROJECTION_ENABLED', previous.enabled], ['TICKET_SYNC_REVISIONS_ENABLED', previous.revisions]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    if (previous.continuationDelay === undefined) delete process.env.PROJECTION_CONTINUATION_DELAY_MS;
    else process.env.PROJECTION_CONTINUATION_DELAY_MS = previous.continuationDelay;
  });
  const calls = [];
  const acknowledgements = [];
  const projectionSummaries = [];
  const acknowledgedIds = new Set();
  const freshCursor = { importedAt: new Date('2026-11-11T01:00:00Z'), ticketRawId: 'fresh-1' };
  const state = { running: false, consecutiveErrors: 0 };
  const filename = path.resolve(__dirname, '../worker-projection.ts');
  const source = readFileSync(filename, 'utf8').replace(/startWorker\(\)\.catch\([\s\S]*$/, '') + '\nasync function runTestPump() { pendingProjectionRun = true; await drainProjectionQueue("test"); }';
  const { __test } = createHarness({
    '@/lib/observability/logger': { logger: { info: (message, context) => {
      if (message === 'Projection task complete') projectionSummaries.push(context);
    }, warn() {}, error() {} } },
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
  assert.equal(projectionSummaries[0].hasMore, true, 'fresh batch continuation is reflected in task summary');
  assert.equal(projectionSummaries[0].continuationPending, true);
  assert.equal(state.consecutiveErrors, 0);
});

test('projection fresh and backlog phases share one per-task time budget', async t => {
  const previousBudget = process.env.PROJECTION_RUN_BUDGET_MS;
  process.env.PROJECTION_RUN_BUDGET_MS = '30000';
  t.after(() => previousBudget === undefined ? delete process.env.PROJECTION_RUN_BUDGET_MS : process.env.PROJECTION_RUN_BUDGET_MS = previousBudget);
  const originalNow = Date.now;
  let now = 100_000;
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  const calls = [];
  const state = { running: false, consecutiveErrors: 0 };
  const source = readFileSync(path.resolve(__dirname, '../worker-projection.ts'), 'utf8').replace(/startWorker\(\)\.catch\([\s\S]*$/, '');
  const { __test } = createHarness({
    'dotenv/config': {},
    '@/app/libs/prisma': { prisma: { projection_request: {
      findMany: async () => [{ id: 1n, syncBatchId: 'fresh' }],
      updateMany: async () => {},
    } } },
    '@/lib/projection': { runProjection: async (_signal, options) => {
      calls.push(options);
      if (calls.length === 1) now += 22_000;
      return { processed: 1, inserted: 1, updated: 0, skipped: 0, failed: 0, retried: 0, checkpoint: {} };
    } },
    '@/lib/workers/task-runner': {
      createTaskState: () => state, parsePositiveInt: (value, fallback) => Number(value) || fallback,
      shouldRunWithCircuitBreaker: () => true, nowWIB: () => 'test',
      withCancellableTimeout: () => { const controller = new AbortController(); return { controller, signal: controller.signal, cancel() {} }; },
      withTaskLock: async (_key, _ttl, fn) => { await fn({ fencingToken: 1 }); return 'acquired'; },
    },
    '@/lib/observability/config-validator': {}, '@/lib/observability/slo-tracker': { recordRun: async () => {} },
  }, { 'worker-projection.ts': ['runProjectionTask'] }, { 'worker-projection.ts': source }).load('worker-projection.ts');
  await __test.runProjectionTask('incremental');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].maxDurationMs, 30_000);
  assert.equal(calls[1].maxDurationMs, 8_000);
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
