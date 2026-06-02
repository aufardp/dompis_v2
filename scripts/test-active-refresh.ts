import 'dotenv/config';
import { runActiveRefresh } from '../lib/active-refresh';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  ACTIVE REFRESH TEST');
  console.log('═══════════════════════════════════════════\n');

  const start = Date.now();
  const result = await runActiveRefresh();
  const duration = Date.now() - start;

  console.log('\n═══════════════════════════════════════════');
  console.log('  ACTIVE REFRESH RESULT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Duration:    ${duration}ms`);
  console.log(`  Batch ID:    ${result.batchId}`);
  console.log(`  Scanned:     ${result.scanned}`);
  console.log(`  Updated:     ${result.updated}`);
  console.log(`  Effective:   ${result.effectiveBatchSize}`);
  console.log(`  Max Scan:    ${result.maxScan}`);
  console.log(`  Backlog Est: ${result.backlogEstimate ?? 'null'}`);
  console.log(`  Budget Stop: ${result.stoppedByBudget ? 'yes' : 'no'}`);
  console.log('═══════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
