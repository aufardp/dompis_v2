const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { createHarness } = require('./helpers/sync-test-harness.cjs');

const prisma = new PrismaClient({
  datasources: { db: { url: 'mysql://root:dompis_sync_test@127.0.0.1:13316/dompis_sync_test' } },
  log: [{ emit: 'event', level: 'query' }],
});
let queries = 0;
let bytes = 0;
prisma.$on('query', event => { queries++; bytes += Buffer.byteLength(event.query) + Buffer.byteLength(event.params); });
const rows = Array.from({ length: 1000 }, (_, index) => ({
  Incident: `INC${91000000 + index}`, Status: 'OPEN', Workzone: 'PKL',
  Summary: 'Representative ticket summary '.repeat(8),
  Reported_Date: '2026-11-03 08:00:00', Last_Update_Ticket: '2026-11-03 09:00:00',
  Customer_Name: `Test customer ${index}`, Service_No: `123456${index}`, Owner_Group: 'ASSURANCE',
  C_DESCRIPTION_SERVICEID: 'Representative extension '.repeat(4),
}));

async function reset() {
  for (const name of ['ticket_projection_log', 'ticket_raw_bridge_ext', 'ticket_source_snapshot', 'ticket_sync_state', 'ticket_raw_finalized', 'ticket', 'ticket_raw', 'ingestion_checkpoint', 'ingestion_quarantine']) {
    await prisma[name].deleteMany();
  }
}

async function run(name, sources, enabled, changedRows) {
  await reset();
  process.env.TICKET_SYNC_REVISIONS_ENABLED = String(enabled);
  const { processRawRows } = createHarness({ '@/app/libs/prisma': { prisma, prismaBulk: prisma } }, {}, sources).load('lib/ingestion/index.ts');
  async function ingest(payload = rows) {
    const result = { processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, quarantined: 0, retried: 0, errors: [] };
    await processRawRows(payload, 'nossa', 'benchmark', { idColumn: null, modifiedColumn: null, createdAtColumn: null, strategy: 'snapshot', columns: [] }, result);
    return result;
  }
  const coldStart = performance.now();
  const first = await ingest();
  const initialIngestMs = Math.round(performance.now() - coldStart);
  assert.equal(first.inserted, rows.length);
  const elapsed = [];
  queries = 0;
  bytes = 0;
  for (let i = 0; i < 5; i++) {
    const payload = rows.map((row, index) => index < changedRows ? {
      ...row, Summary: `${row.Summary} revision ${i + 1}`,
      Last_Update_Ticket: `2026-11-03 09:0${i + 1}:00`,
    } : row);
    const start = performance.now();
    const result = await ingest(payload);
    elapsed.push(performance.now() - start);
    assert.equal(result.skipped, rows.length - changedRows);
    assert.equal(result.updated, changedRows);
  }
  const metrics = { name, rows: rows.length, initialIngestMs, medianBatchMs: Math.round(elapsed.sort((a, b) => a - b)[2]), queriesPerBatch: queries / 5, sqlBytesPerBatch: Math.round(bytes / 5) };
  const data = await prisma.ticket_raw.findMany({ orderBy: { incident: 'asc' }, select: { incident: true, sourceHash: true, summary: true, status: true, syncVersion: true } });
  return { metrics, digest: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}

(async () => {
  const previousSource = execFileSync('git', ['show', 'HEAD:lib/ingestion/index.ts'], { encoding: 'utf8' });
  const workloads = [];
  for (const changedRows of [0, 10, 100, 1000]) {
    const previous = await run('HEAD ingestion baseline', { 'lib/ingestion/index.ts': previousSource }, false, changedRows);
    const current = await run('revision implementation', {}, true, changedRows);
    assert.equal(current.digest, previous.digest, 'Both implementations must produce identical business data');
    workloads.push({ changedRows, results: [previous.metrics, current.metrics], identicalBusinessData: true });
  }
  console.log(JSON.stringify({ fixture: '1000 rows, 5 samples per workload, local MySQL only; initial ingestion is a single sample without extra warmup', workloads }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
