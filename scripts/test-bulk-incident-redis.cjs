const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { randomUUID } = require('node:crypto');
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '16379';
const harness = createHarness();
const jobs = harness.load('lib/ingestion/single-incident-queue.ts');
const queue = jobs.singleIncidentQueue;
before(async () => { await queue.waitUntilReady(); await queue.obliterate({ force: true }); });
after(() => queue.close());

test('concurrent submissions share pending work and completed work can be fetched again', async () => {
  const incident = 'INC90000101';
  const requestId = randomUUID();
  const [first, duplicate, other] = await Promise.all([
    jobs.enqueueSingleIncident(incident, requestId), jobs.enqueueSingleIncident(incident, requestId),
    jobs.enqueueSingleIncident(incident, randomUUID()),
  ]);
  assert.equal(first, duplicate);
  assert.equal(first, other);
  const redis = new Redis({ host: '127.0.0.1', port: 16379 });
  try { assert.ok(await redis.ttl(`ingestion:incident:latest:${incident}`) > 0); }
  finally { redis.disconnect(); }
  assert.equal(await queue.count(), 1);
  const worker = new Worker(jobs.SINGLE_INCIDENT_QUEUE_NAME, async () => ({ success: true, message: 'Applied' }), {
    connection: { host: '127.0.0.1', port: 16379 },
  });
  try {
    const deadline = Date.now() + 5000;
    while (await (await queue.getJob(first)).getState() !== 'completed') {
      assert.ok(Date.now() < deadline, 'fixture worker did not complete');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally { await worker.close(); }
  const next = await jobs.enqueueSingleIncident(incident, randomUUID());
  assert.notEqual(next, first);
  assert.equal(await jobs.enqueueSingleIncident(incident, requestId), first);
});

test('mass submissions are resumable, payload-bound and scoped to the submitting user', async () => {
  const batch = harness.load('lib/ingestion/bulk-incidents.ts');
  const requestId = randomUUID();
  const incidents = ['INC90000102', 'INC90000103'];
  const first = await batch.enqueueBulkIncidents(7, requestId, incidents);
  assert.equal(first.total, 2);
  assert.equal(first.pendingEnqueue, 0);
  const replay = await batch.enqueueBulkIncidents(7, requestId, incidents);
  assert.deepEqual(replay.items.map(item => item.jobId), first.items.map(item => item.jobId));
  await assert.rejects(batch.enqueueBulkIncidents(7, requestId, ['INC90000104']), error => error.status === 409);
  await assert.rejects(batch.getBulkIncidentReport(8, requestId), error => error.status === 404);
});

test('an interrupted submission can resume without duplicating queued incidents', async () => {
  let interrupt = true;
  const batch = createHarness({ '@/lib/ingestion/single-incident-queue': {
    ...jobs, enqueueSingleIncident: async (incident, id) => {
      if (incident === 'INC90000106' && interrupt) throw new Error('fixture connection interrupted');
      return jobs.enqueueSingleIncident(incident, id);
    },
  } }).load('lib/ingestion/bulk-incidents.ts');
  const requestId = randomUUID();
  await assert.rejects(batch.enqueueBulkIncidents(9, requestId, ['INC90000105', 'INC90000106']), /interrupted/);
  const interrupted = await batch.getBulkIncidentReport(9, requestId);
  assert.equal(interrupted.pendingEnqueue, 1);
  interrupt = false;
  const resumed = await batch.enqueueBulkIncidents(9, requestId, ['INC90000105', 'INC90000106']);
  assert.equal(resumed.pendingEnqueue, 0);
  assert.equal(resumed.items[0].jobId, interrupted.items[0].jobId);
});
