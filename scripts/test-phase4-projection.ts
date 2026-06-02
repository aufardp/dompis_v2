import assert from 'node:assert/strict';
import {
  resolveProjectionStatusUpdate,
  shouldSkipProjection,
} from '@/lib/projection';

function createRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_ticket: 'raw-1',
    incident: 'INC-1',
    sourceTable: 'source_a',
    sourceHash: 'hash-1',
    syncVersion: 3,
    status: 'OPEN',
    importedAt: new Date('2026-05-28T10:00:00+07:00'),
    syncBatchId: 'batch-1',
    ...overrides,
  };
}

function testSkipForExactSuccessfulProjectionLog() {
  const raw = createRaw();
  const skipped = shouldSkipProjection(
    raw as any,
    {
      id_ticket: 1,
      incident: 'INC-1',
      teknisi_user_id: null,
      description_solution_dompis: null,
      pending_dompis: null,
      synced_at: new Date('2026-05-28T10:00:05+07:00'),
      import_batch: 'batch-1',
      status_update: 'open',
      closed_at: null,
      rca: null,
      sub_rca: null,
      status_manja: null,
      alamat: null,
    } as any,
    {
      ticketRawId: 'raw-1',
      sourceHash: 'hash-1',
      syncVersion: 3,
      status: 'success',
    },
  );

  assert.equal(skipped, true);
}

function testDoNotSkipWhenProjectionLogIsDifferent() {
  const raw = createRaw({ sourceHash: 'hash-2', syncVersion: 4 });
  const skipped = shouldSkipProjection(
    raw as any,
    {
      id_ticket: 1,
      incident: 'INC-1',
      teknisi_user_id: null,
      description_solution_dompis: null,
      pending_dompis: null,
      synced_at: new Date('2026-05-28T09:59:59+07:00'),
      import_batch: 'batch-0',
      status_update: 'open',
      closed_at: null,
      rca: null,
      sub_rca: null,
      status_manja: null,
      alamat: null,
    } as any,
    {
      ticketRawId: 'raw-1',
      sourceHash: 'hash-1',
      syncVersion: 3,
      status: 'success',
    },
  );

  assert.equal(skipped, false);
}

function testProtectedStatusRemainsProtected() {
  const resolved = resolveProjectionStatusUpdate('assigned', 'closed', 99);
  assert.deepEqual(resolved, { protected: true });
}

function main() {
  testSkipForExactSuccessfulProjectionLog();
  testDoNotSkipWhenProjectionLogIsDifferent();
  testProtectedStatusRemainsProtected();
  console.log('[test:phase4] projection guards passed');
}

main();
