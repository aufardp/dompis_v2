const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');
const Redis = require('ioredis');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

const redis = new Redis({ host: '127.0.0.1', port: 13379, maxRetriesPerRequest: 1, retryStrategy: null });
const keys = ['ratelimit:qosmic-bridge:all', 'ratelimit:qosmic-bridge:global', 'ratelimit:qosmic-bridge:backfill'];
const { takeBridgeRateSlot } = createHarness({
  '@/lib/redis': { redis, isRedisReady: () => true },
}).load('lib/external-db/qosmic-bridge/rate-limit.ts');
beforeEach(() => redis.del(...keys));
after(() => redis.quit());

test('concurrent ingestion and backfill share an atomic global sliding window', async () => {
  const results = await Promise.all(Array.from({ length: 100 }, (_, i) =>
    takeBridgeRateSlot(i % 5 ? 'qosmic-bridge:global' : 'qosmic-bridge:backfill', 20, i % 5 ? 18 : 2)));
  assert.equal(results.filter(wait => wait === 0).length, 20);
  assert.equal(await redis.zcard(keys[0]), 20);
  assert.equal(await redis.zcard(keys[1]), 18);
  assert.equal(await redis.zcard(keys[2]), 2);
});

test('the global cap also holds when class budgets together exceed it', async () => {
  const results = await Promise.all(Array.from({ length: 100 }, (_, i) =>
    takeBridgeRateSlot(i % 2 ? 'qosmic-bridge:global' : 'qosmic-bridge:backfill', 20, 18)));
  assert.equal(results.filter(wait => wait === 0).length, 20);
});

test('expired entries free capacity without waiting on an application clock', async () => {
  await redis.zadd(keys[0], Date.now() - 61000, 'expired');
  assert.equal(await takeBridgeRateSlot('qosmic-bridge:global', 1, 1), 0);
  assert.ok(await takeBridgeRateSlot('qosmic-bridge:global', 1, 1) > 0);
});

test('Redis unavailable pauses external requests', async () => {
  const unavailable = createHarness({ '@/lib/redis': { redis, isRedisReady: () => false } }).load('lib/external-db/qosmic-bridge/rate-limit.ts');
  await assert.rejects(() => unavailable.takeBridgeRateSlot('qosmic-bridge:global', 20, 18), /unavailable/);
});
