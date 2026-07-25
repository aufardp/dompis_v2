import 'dotenv/config';
import { waitForRedisReady } from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';
import { isQosmicBridgeConfigured } from '@/lib/external-db/qosmic-bridge/client';
import { splitIntoInitialWindows } from '@/lib/external-db/qosmic-bridge/window-planner';

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

  if (process.env.BRIDGE_JOB_BACKFILL_ENABLED !== 'true') {
    console.error('BRIDGE_JOB_BACKFILL_ENABLED is not true. Set it to true in ecosystem.config.js before running backfill.');
    process.exit(1);
  }

  await waitForRedisReady(5_000);

  const { backfillQueue } = await import('@/lib/external-db/qosmic-bridge/bridge-queue');
  const windows = splitIntoInitialWindows(fromDate, toDate, maxWindowDays);

  const startTime = Date.now();
  let pushed = 0;

  console.log(`\n📋  Backfill Plan`);
  console.log(`    From: ${fromDate} → To: ${toDate}`);
  console.log(`    Windows: ${windows.length} (max ${maxWindowDays} days each)`);
  console.log(`    Budget: 6 req/min (via bridge:backfill queue)`);
  console.log();

  for (const w of windows) {
    const jobId = `backfill-${w.dateFrom}-${w.dateTo}-${Date.now()}`;
    await backfillQueue.add(
      'backfill:window',
      { from: w.dateFrom, to: w.dateTo },
      { jobId },
    );
    pushed++;
    console.log(`  [${pushed}/${windows.length}] Pushed: ${w.dateFrom} → ${w.dateTo}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(`\n✅  All ${pushed} windows pushed to queue in ${fmtDuration(elapsed)}`);
  console.log(`    Bridge worker will process them at 6 req/min budget.`);
  console.log(`    Monitor: pm2 logs dompis-bridge-worker`);
}

main()
  .catch((error) => {
    console.error('Backfill scheduling failed:', error);
    process.exitCode = 1;
  });
