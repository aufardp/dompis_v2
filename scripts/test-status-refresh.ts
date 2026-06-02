import 'dotenv/config';
import { runStatusRefresh } from '../lib/status-refresh';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  STATUS REFRESH TEST');
  console.log('═══════════════════════════════════════════\n');

  const enabled = process.env.STATUS_REFRESH_ENABLED === 'true';
  console.log(`[0] STATUS_REFRESH_ENABLED: ${enabled ? 'true' : 'false'}\n`);

  const start = Date.now();
  const result = await runStatusRefresh();
  const duration = Date.now() - start;

  console.log('\n═══════════════════════════════════════════');
  console.log('  STATUS REFRESH RESULT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Duration:    ${duration}ms`);
  console.log(`  Batch ID:    ${result.batchId}`);
  console.log(`  Scanned:     ${result.scanned}`);
  console.log(`  Fetched:     ${result.fetched}`);
  console.log(`  Changed:     ${result.changed}`);
  console.log(`  Unchanged:   ${result.unchanged}`);
  console.log(`  Missing:     ${result.missing}`);
  console.log(`  Effective:   ${result.effectiveBatchSize}`);
  console.log(`  Backlog Est: ${result.backlogEstimate ?? 'null'}`);
  console.log(`  Budget Stop: ${result.durationMs > 0 && result.scanned > 0 ? 'no' : 'yes/short-circuit'}`);
  if (!enabled) {
    console.log('  Note: STATUS_REFRESH_ENABLED is not true, so the worker exited immediately.');
  }
  console.log('═══════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
