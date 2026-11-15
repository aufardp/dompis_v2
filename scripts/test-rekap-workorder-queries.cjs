const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

test('legacy customer counts are derived from already fetched rekap aggregates', () => {
  const aggregate = createHarness({
    '@/app/libs/ticket-utils': { CLOSE_STATUS_VALUES: [], getTicketCategory: () => 'open' },
    '@/lib/rekap/rekap-classify': {},
    '@/lib/dept': {},
    '@/app/config/jenis-tiket': {},
  }).load('app/api/dashboard/rekap-workorder/aggregate.ts');

  const rows = aggregate.buildLegacyCustomerRowsFromRekapRows([
    { area: 'Area 1', sa_name: 'SA 1', workzone: 'SA 1', status: 'OPEN', status_update: 'open', operational_bucket: 'kpi_customer', kpi_seg: 'b2c', cnt: 3n },
    { area: 'Area 1', sa_name: 'SA 1', workzone: 'SA 1', status: 'OPEN', status_update: 'open', operational_bucket: 'kpi_customer', kpi_seg: 'b2b', cnt: 5n },
    { area: 'Area 1', sa_name: 'SA 1', workzone: 'SA 1', status: 'OPEN', status_update: 'open', operational_bucket: 'kpi_customer', kpi_seg: 'netral', cnt: 19n },
    { area: 'Area 1', sa_name: 'SA 1', workzone: 'SA 1', status: 'CLOSED', status_update: 'close', operational_bucket: 'kpi_proactive', cnt: 11n },
  ]);

  assert.deepEqual(rows, [
    { area: 'Area 1', sa_name: 'SA 1', workzone: 'SA 1', status: 'OPEN', status_update: 'open', cnt: 8n },
  ]);
});
