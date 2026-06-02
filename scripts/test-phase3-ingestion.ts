import assert from 'node:assert/strict';
import { resolveConflict } from '@/lib/ingestion/conflict-resolver';

function testStaleSourceRejected() {
  const existingUpdatedAt = new Date('2026-05-28T10:05:00+07:00');
  const incomingUpdatedAt = new Date('2026-05-28T10:00:00+07:00');

  const result = resolveConflict(
    {
      sourceHash: 'hash-current',
      status: 'OPEN',
      syncVersion: 4,
      sourceUpdatedAt: existingUpdatedAt,
    },
    'hash-older',
    'PENDING',
    incomingUpdatedAt,
  );

  assert.equal(result.shouldInsert, false);
  assert.equal(result.shouldUpdate, false);
  assert.equal(result.newVersion, 4);
  assert.equal(result.newStatus, 'OPEN');
  assert.equal(result.reason, 'stale_source');
}

function testNewerSourceCanUpdate() {
  const existingUpdatedAt = new Date('2026-05-28T10:00:00+07:00');
  const incomingUpdatedAt = new Date('2026-05-28T10:05:00+07:00');

  const result = resolveConflict(
    {
      sourceHash: 'hash-old',
      status: 'OPEN',
      syncVersion: 2,
      sourceUpdatedAt: existingUpdatedAt,
    },
    'hash-new',
    'PENDING',
    incomingUpdatedAt,
  );

  assert.equal(result.shouldInsert, false);
  assert.equal(result.shouldUpdate, true);
  assert.equal(result.newVersion, 3);
  assert.equal(result.newStatus, 'PENDING');
  assert.equal(result.reason, 'hash_changed');
}

function testSameHashNoChange() {
  const result = resolveConflict(
    {
      sourceHash: 'same-hash',
      status: 'CLOSED',
      syncVersion: 9,
      sourceUpdatedAt: new Date('2026-05-28T10:00:00+07:00'),
    },
    'same-hash',
    'OPEN',
    new Date('2026-05-28T10:10:00+07:00'),
  );

  assert.equal(result.shouldInsert, false);
  assert.equal(result.shouldUpdate, false);
  assert.equal(result.newVersion, 9);
  assert.equal(result.newStatus, 'CLOSED');
  assert.equal(result.reason, 'no_change');
}

function main() {
  testStaleSourceRejected();
  testNewerSourceCanUpdate();
  testSameHashNoChange();
  console.log('[test:phase3] ingestion conflict resolution passed');
}

main();
