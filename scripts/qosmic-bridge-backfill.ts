import 'dotenv/config';
import { prisma } from '@/app/libs/prisma';
import { waitForRedisReady } from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';
import { iterateNossaClosedBackfill } from '@/lib/external-db/qosmic-bridge/nossa';
import { isQosmicBridgeConfigured } from '@/lib/external-db/qosmic-bridge/client';
import { processRawRows, ChunkResult } from '@/lib/ingestion';
import type { ExternalCursorDefinition } from '@/lib/external-db/connection';
import { nowWib } from '@/lib/timezone';

function parseArg(key: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${key}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function parseDateArg(key: string, fallback: string): string {
  const raw = parseArg(key, fallback);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error(`Invalid date format for --${key}: "${raw}" (expected YYYY-MM-DD)`);
    process.exit(1);
  }
  return raw;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function main() {
  const fromDate = parseDateArg('from', '2026-01-01');
  const toDate = parseDateArg('to', new Date().toISOString().slice(0, 10));
  const maxWindowDays = parseInt(parseArg('max-window-days', '7'), 10);

  if (!isQosmicBridgeConfigured()) {
    console.error('QOSMIC Bridge is not configured. Set QOSMIC_BRIDGE_ENABLED=true and provide BASE_URL + TOKEN.');
    process.exit(1);
  }

  if (fromDate > toDate) {
    console.error(`--from (${fromDate}) cannot be after --to (${toDate})`);
    process.exit(1);
  }

  await waitForRedisReady(5_000);

  const batchId = `bridge-backfill-${Date.now()}`;
  const cursor: ExternalCursorDefinition = {
    idColumn: null,
    modifiedColumn: null,
    createdAtColumn: null,
    strategy: 'snapshot',
    columns: [],
  };
  const result: ChunkResult = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    retried: 0,
    errors: [],
  };

  const startTime = Date.now();
  let totalWindows = 0;
  let aborted = false;
  const abortController = new AbortController();

  const onSignal = () => {
    if (aborted) return;
    aborted = true;
    console.log('\n⚠️  Backfill interrupted — shutting down gracefully...');
    abortController.abort();
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  logger.info('[BridgeBackfill] Starting', { fromDate, toDate, maxWindowDays, batchId });

  try {
    for await (const { window: dateWindow, rows } of iterateNossaClosedBackfill(
      fromDate,
      toDate,
      {},
      maxWindowDays,
    )) {
      if (aborted) break;
      if (rows.length === 0) {
        logger.info('[BridgeBackfill] Empty window, skipping', { window: dateWindow });
        continue;
      }

      const windowStart = Date.now();
      await processRawRows(
        rows as unknown as Record<string, unknown>[],
        'nossa_closed',
        batchId,
        cursor,
        result,
        abortController.signal,
      );
      totalWindows++;

      const windowDuration = Date.now() - windowStart;
      const elapsed = Date.now() - startTime;
      const rate = elapsed > 0 ? Math.round(((result.processed || 0) / elapsed) * 1000 * 100) / 100 : 0;

      logger.info('[BridgeBackfill] Window completed', {
        window: dateWindow,
        rows: rows.length,
        windowDurationMs: windowDuration,
        totalProcessed: result.processed,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        quarantined: result.quarantined,
        retried: result.retried,
        windowsCompleted: totalWindows,
        rateRowsPerSec: rate,
      });

      console.log(
        `  [${dateWindow.dateFrom} → ${dateWindow.dateTo}] ` +
        `${rows.length} rows in ${fmtDuration(windowDuration)} ` +
        `│ total ${result.processed} processed ` +
        `(${result.inserted} ins / ${result.updated} upd / ${result.skipped} skp / ${result.failed} fail)` +
        ` │ ${rate} rows/s`,
      );
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  const elapsed = Date.now() - startTime;
  const rate = elapsed > 0 ? Math.round(((result.processed || 0) / elapsed) * 1000 * 100) / 100 : 0;

  if (aborted) {
    console.log(`\n⚠️  Backfill ABORTED after ${fmtDuration(elapsed)}`);
  } else {
    console.log(`\n✅  Backfill COMPLETE in ${fmtDuration(elapsed)}`);
  }

  console.log(`    Windows: ${totalWindows}`);
  console.log(`    Processed: ${result.processed}`);
  console.log(`    Inserted: ${result.inserted}`);
  console.log(`    Updated: ${result.updated}`);
  console.log(`    Skipped: ${result.skipped}`);
  console.log(`    Failed: ${result.failed}`);
  console.log(`    Quarantined: ${result.quarantined}`);
  console.log(`    Rate: ${rate} rows/s`);

  if (result.errors.length > 0) {
    console.log(`\n⚠️  ${result.errors.length} error(s) occurred (check logs for details)`);
  }
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
