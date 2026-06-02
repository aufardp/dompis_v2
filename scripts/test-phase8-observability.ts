import assert from 'node:assert/strict';
import { getMetricAgeMs, parseProjectionCheckpointMeta } from '@/lib/observability/worker-health';
import { logger } from '@/lib/observability/logger';

function testMetricAge() {
  const now = Date.now();
  const age = getMetricAgeMs(now - 5_000);
  assert.ok(age !== null);
  assert.ok(age! >= 5_000);
  assert.equal(getMetricAgeMs(null), null);
}

function testProjectionCheckpointParsing() {
  const iso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const parsed = parseProjectionCheckpointMeta(
    `cursor=abc|neverProjected=12|oldestPending=${iso}`,
  );

  assert.equal(parsed.neverProjected, 12);
  assert.ok(parsed.oldestPendingAgeMs !== null);
  assert.ok(parsed.oldestPendingAgeMs! >= 10 * 60 * 1000);
}

function testLoggerRedaction() {
  const lines: string[] = [];
  const originalWarn = console.warn;

  console.warn = (line?: unknown) => {
    lines.push(String(line ?? ''));
  };

  try {
    logger.warn('testing redaction', {
      authorization: 'Bearer abc.def.ghi',
      refreshToken: 'plain-secret-value',
      nested: {
        password: 'super-secret',
        keep: 'visible-value',
      },
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(payload.authorization, '[REDACTED]');
  assert.equal(payload.refreshToken, '[REDACTED]');
  assert.deepEqual(payload.nested, {
    password: '[REDACTED]',
    keep: 'visible-value',
  });
}

function main() {
  testMetricAge();
  testProjectionCheckpointParsing();
  testLoggerRedaction();
  console.log('[test:phase8] observability helpers passed');
}

main();
