const assert = require('node:assert/strict');
const { test } = require('node:test');
const Redis = require('ioredis');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

const url = process.env.WRITER_TEST_REDIS_URL || 'redis://127.0.0.1:13379';
const parsed = new URL(url);
assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname) && ['13379', '16379'].includes(parsed.port), 'Writer tests require an isolated local Redis');
const key = 'lock:ticket_raw_writer';
const queue = `${key}:queue`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (await fn()) return; await sleep(10); }
  throw new Error('Fixture did not reach expected state');
}
function loadWriter(redis, waitMs = 3000) {
  const previous = { ...process.env };
  process.env.TICKET_RAW_WRITER_WAIT_MS = String(waitMs);
  process.env.TICKET_RAW_WRITER_POLL_MS = '25';
  process.env.TICKET_RAW_WRITER_QUEUE_LEASE_MS = '500';
  const runner = {};
  const harness = createHarness({
    '@/lib/redis': { redis, isRedisReady: () => redis.status === 'ready' },
    '@/lib/workers/task-runner': runner,
    '@/lib/observability/logger': { createCorrelationId: () => 'test', logger: { info() {}, warn() {}, error() {} } },
  });
  try {
    Object.assign(runner, harness.load('lib/workers/task-runner.ts'));
    return harness.load('lib/ingestion/raw-writer-lock.ts').withTicketRawWriterLock;
  } finally {
    for (const name of ['TICKET_RAW_WRITER_WAIT_MS', 'TICKET_RAW_WRITER_POLL_MS', 'TICKET_RAW_WRITER_QUEUE_LEASE_MS']) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
}

test('writer coordination against Redis', async t => {
  const redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null });
  await redis.connect();
  async function reset() {
    await redis.del(key, `${key}:meta`, `${key}:fencing`, queue, `${queue}:leases`, `${queue}:sequence`);
  }
  t.after(async () => { try { await reset(); } finally { redis.disconnect(); } });

  await t.test('a busy producer cannot overtake writers already waiting', async () => {
    await reset();
    const firstWriter = loadWriter(redis);
    const otherWriter = loadWriter(redis);
    const order = [];
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    let active = 0;
    let peak = 0;
    const write = async (name, block) => { peak = Math.max(peak, ++active); order.push(name); if (block) await block; active--; };
    const producer = (async () => {
      await firstWriter(() => write('A', hold));
      await firstWriter(() => write('D'));
    })();
    await until(async () => await redis.exists(key));
    const second = otherWriter(() => write('B'));
    await until(async () => await redis.zcard(queue) >= 2);
    const third = otherWriter(() => write('C'));
    await until(async () => await redis.zcard(queue) >= 3);
    release();
    await Promise.all([producer, second, third]);
    assert.deepEqual(order, ['A', 'B', 'C', 'D']);
    assert.equal(peak, 1);
    assert.equal(await redis.zcard(queue), 0);
  });

  await t.test('aborting a waiter removes its place and permits the next writer', async () => {
    await reset();
    const writer = loadWriter(redis);
    let release;
    const first = writer(() => new Promise(resolve => { release = resolve; }));
    await until(async () => await redis.exists(key));
    const controller = new AbortController();
    const aborted = writer(() => assert.fail('aborted writer executed'), controller.signal);
    const rejected = assert.rejects(aborted, /cancelled/);
    await until(async () => await redis.zcard(queue) >= 2);
    const next = writer(async () => 'next');
    await until(async () => await redis.zcard(queue) >= 3);
    controller.abort(new Error('cancelled'));
    await rejected;
    release();
    await first;
    assert.equal(await next, 'next');
    assert.equal(await redis.zcard(queue), 0);
  });

  await t.test('an abandoned waiter expires without stranding the queue', async () => {
    await reset();
    await redis.zadd(queue, await redis.incr(`${queue}:sequence`), 'dead-worker');
    await redis.zadd(`${queue}:leases`, Date.now() + 100, 'dead-worker');
    assert.equal(await loadWriter(redis)(async () => 'recovered'), 'recovered');
    assert.equal(await redis.zcard(queue), 0);
  });

  await t.test('a lock timeout reports its owner and removes the timed-out waiter', async () => {
    await reset();
    await redis.set(key, 'blocked-owner', 'PX', 2000);
    await assert.rejects(loadWriter(redis, 100)(() => assert.fail('blocked writer executed')), error => {
      assert.equal(error.code, 'TICKET_RAW_WRITER_LOCK_TIMEOUT');
      assert.equal(error.blockingOwner, 'blocked-owner');
      assert.ok(error.waitMs >= 100);
      return true;
    });
    assert.equal(await redis.zcard(queue), 0);
    assert.equal(await redis.get(key), 'blocked-owner');
  });

  await t.test('a failed write releases both the lock and its queue entry', async () => {
    await reset();
    const writer = loadWriter(redis);
    await assert.rejects(writer(async () => { throw new Error('database failed'); }), /database failed/);
    assert.equal(await redis.exists(key), 0);
    assert.equal(await redis.zcard(queue), 0);
    assert.equal(await writer(async () => 'retry'), 'retry');
  });

  await t.test('expiry of an active writer queue lease cannot admit a second writer', async () => {
    await reset();
    const writer = loadWriter(redis);
    let active = false;
    const first = writer(async () => { active = true; await sleep(700); active = false; });
    await until(async () => active);
    const next = writer(async () => assert.equal(active, false));
    await Promise.all([first, next]);
  });

  await t.test('Redis unavailability refuses the write', async () => {
    const writer = loadWriter({ status: 'end' });
    await assert.rejects(writer(() => assert.fail('uncoordinated write')), /Redis unavailable/);
  });
});
