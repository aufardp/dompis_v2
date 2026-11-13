const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

function bridge(t) {
  const previous = { fetch: global.fetch, url: process.env.QOSMIC_BRIDGE_BASE_URL, token: process.env.QOSMIC_BRIDGE_TOKEN, timeout: process.env.QOSMIC_BRIDGE_TIMEOUT_MS };
  Object.assign(process.env, { QOSMIC_BRIDGE_BASE_URL: 'https://bridge.invalid', QOSMIC_BRIDGE_TOKEN: 'test', QOSMIC_BRIDGE_TIMEOUT_MS: '10' });
  t.after(() => {
    global.fetch = previous.fetch;
    for (const [key, value] of [['QOSMIC_BRIDGE_BASE_URL', previous.url], ['QOSMIC_BRIDGE_TOKEN', previous.token], ['QOSMIC_BRIDGE_TIMEOUT_MS', previous.timeout]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  return createHarness({ '@/lib/external-db/qosmic-bridge/rate-limit': { takeBridgeRateSlot: async () => 0 } }).load('lib/external-db/qosmic-bridge/client.ts');
}

test('queue-owned retries stop after one HTTP timeout with an explicit cause', async t => {
  const { qosmicBridgeGet } = bridge(t);
  let calls = 0;
  global.fetch = async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')), { once: true }));
  };
  await assert.rejects(qosmicBridgeGet('/nossa-closed', { label: 'incident', retryMax: 0 }), error => error.code === 'TIMEOUT' && /10 ms/.test(error.message));
  assert.equal(calls, 1);
});

test('HTML responses have a typed error instead of a JSON parsing exception', async t => {
  const { qosmicBridgeGet } = bridge(t);
  global.fetch = async () => new Response('<html>Proxy error</html>', { status: 200 });
  await assert.rejects(qosmicBridgeGet('/nossa', { label: 'incident', retryMax: 0 }), error => error.code === 'INVALID_RESPONSE' && error.retryable);
});

test('permanent Bridge failures remain non-retryable', async t => {
  const { qosmicBridgeGet } = bridge(t);
  let calls = 0;
  global.fetch = async () => { calls++; return new Response('{}', { status: 401 }); };
  await assert.rejects(qosmicBridgeGet('/nossa', { label: 'incident', retryMax: 0 }), error => error.status === 401 && !error.retryable);
  assert.equal(calls, 1);
});

test('mass incident input normalizes and deduplicates without silently dropping invalid entries', () => {
  const { parseIncidentInput } = createHarness().load('lib/ingestion/incident-input.ts');
  assert.deepEqual(parseIncidentInput(' inc52661271,INC52661271;\nINC51123643 '), {
    incidents: ['INC52661271', 'INC51123643'], duplicates: 1, invalid: [],
  });
  assert.deepEqual(parseIncidentInput('INC52661271 wrong-id').invalid, ['WRONG-ID']);
  assert.throws(() => parseIncidentInput(Array.from({ length: 201 }, (_, i) => `INC${90000000 + i}`)), /200/);
});

test('completed queue jobs with a business failure are reported as failures', async () => {
  const { readIncidentJobStatus } = createHarness({ bullmq: { Queue: class {} } }).load('lib/ingestion/single-incident-queue.ts');
  const status = await readIncidentJobStatus('INC52661271', {
    id: 'job', getState: async () => 'completed', attemptsMade: 1,
    returnvalue: { success: false, message: 'Insiden tidak ditemukan' },
  });
  assert.equal(status.success, false);
  assert.equal(status.terminal, true);
  assert.equal(status.message, 'Insiden tidak ditemukan');
});

test('bulk API rejects unauthorized access before reading or queuing incidents', async () => {
  let queued = false;
  const api = createHarness({
    '@/app/libs/protectApi': { protectApi: async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); } },
    '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
    '@/lib/ingestion/bulk-incidents': { enqueueBulkIncidents: async () => { queued = true; } },
  }).load('app/api/admin/ingest-incidents/route.ts');
  const response = await api.POST(new Request('http://localhost/api/admin/ingest-incidents', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 401);
  assert.equal(queued, false);
});

test('bulk API enforces the body limit and passes the authenticated owner to the queue', async () => {
  let submitted;
  const api = createHarness({
    '@/app/libs/protectApi': { protectApi: async () => ({ id_user: 7 }) },
    '@/lib/api-rate-limit': { enforceApiRateLimit: async () => null },
    '@/lib/ingestion/bulk-incidents': { enqueueBulkIncidents: async (...args) => { submitted = args; return { requestId: args[1], total: 1 }; } },
  }).load('app/api/admin/ingest-incidents/route.ts');
  const request = body => new Request('http://localhost/api/admin/ingest-incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await api.POST(new Request('http://localhost/api/admin/ingest-incidents', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await api.POST(request('x'.repeat(32769)))).status, 413);
  assert.equal(submitted, undefined);
  assert.equal((await api.POST(request('{'))).status, 400);
  const response = await api.POST(request(JSON.stringify({ requestId: 'request', incidents: ['INC52661271'], userId: 99 })));
  assert.equal(response.status, 202);
  assert.deepEqual(submitted, [7, 'request', ['INC52661271']]);
});

test('single ingestion delegates retries and preserves permanent Bridge errors', async () => {
  let options;
  class BridgeError extends Error { retryable = false; code = 'NOT_CONFIGURED'; }
  const harness = createHarness({
    '@/lib/redis': { isRedisReady: () => true },
    '@/lib/distributed-lock': {
      getLockStatus: async () => ({ held: false }), acquireLock: async () => ({ acquired: true, ownerId: 'fixture' }),
      extendLock: async () => true, releaseLock: async () => true,
    },
    '@/lib/external-db/qosmic-bridge/client': { QosmicBridgeError: BridgeError },
    '@/lib/external-db/qosmic-bridge/nossa': { fetchByIncidentAnyStatus: async (_incident, opts) => { options = opts; throw new BridgeError('Not configured'); } },
    '@/lib/projection/single': {},
  });
  const result = await harness.load('lib/ingestion/single-incident-ingestion.ts').ingestSingleIncident('INC52661271');
  assert.equal(options.retryMax, 0);
  assert.equal(result.retryable, false);
  assert.equal(result.errorCode, 'NOT_CONFIGURED');
});

test('the mass ingestion client preserves useful errors from JSON and HTML responses', async () => {
  let response;
  const { requestIncidentReport } = createHarness({
    '@/app/libs/fetcher': { fetchWithAuth: async () => response },
  }).load('app/admin/ingest-incident/request.ts');
  response = new Response('<html>Gateway timeout</html>', { status: 524 });
  await assert.rejects(requestIncidentReport('/api/admin/ingest-incidents'), /524/);
  response = Response.json({ success: false, message: 'Permintaan kedaluwarsa' }, { status: 404 });
  await assert.rejects(requestIncidentReport('/api/admin/ingest-incidents'), error => error.status === 404 && error.message === 'Permintaan kedaluwarsa');
});

test('restored submissions must be valid and younger than the report retention', () => {
  const { restoreIncidentSubmission } = createHarness().load('app/admin/ingest-incident/request.ts');
  const saved = { requestId: '6a7f1d02-1db6-4c65-9c75-c111d325ab41', incidents: ['INC52661271'], savedAt: Date.now() };
  assert.deepEqual(restoreIncidentSubmission(JSON.stringify(saved)), saved);
  assert.equal(restoreIncidentSubmission('{'), null);
  assert.equal(restoreIncidentSubmission(JSON.stringify({ ...saved, savedAt: 0 })), null);
  assert.equal(restoreIncidentSubmission(JSON.stringify({ ...saved, incidents: ['INVALID'] })), null);
});

test('the mass ingestion client explains network failures and rejects malformed reports', async () => {
  let response;
  const { requestIncidentReport } = createHarness({
    '@/app/libs/fetcher': { fetchWithAuth: async () => { if (!response) throw new DOMException('Request timed out', 'TimeoutError'); return response; } },
  }).load('app/admin/ingest-incident/request.ts');
  await assert.rejects(requestIncidentReport('/fixture'), /Periksa status sebelum mengirim ulang/);
  response = Response.json({ success: true, report: { requestId: '6a7f1d02-1db6-4c65-9c75-c111d325ab41', total: 1, terminal: false, items: [{}] } });
  await assert.rejects(requestIncidentReport('/fixture'), /tidak lengkap/);
});
