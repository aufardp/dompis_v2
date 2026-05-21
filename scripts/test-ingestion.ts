import 'dotenv/config';
import { runIngestion } from '../lib/ingestion';
import { testExternalConnection, getTableNames } from '../lib/external-db/connection';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  INGESTION TEST');
  console.log('═══════════════════════════════════════════\n');

  // Step 1: Test external connection
  console.log('[1] Testing External DB Connection...');
  const connected = await testExternalConnection();
  console.log(`    External DB: ${connected ? '✅ Connected' : '❌ Not Connected'}\n`);

  if (!connected) {
    console.log('⚠️  Check EXTERNAL_DB_* environment variables in .env');
    process.exit(1);
  }

  // Step 2: Show configured tables
  const tables = getTableNames();
  console.log(`[2] Configured Tables: ${tables.join(', ')}\n`);

  // Step 3: Check ticket_raw count before
  const beforeCount = await prisma.ticket_raw.count();
  console.log(`[3] ticket_raw count before: ${beforeCount}\n`);

  // Step 4: Run ingestion
  console.log('[4] Running Ingestion...\n');
  const start = Date.now();
  const result = await runIngestion();
  const duration = Date.now() - start;

  console.log('\n═══════════════════════════════════════════');
  console.log('  INGESTION RESULT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Duration:    ${duration}ms`);
  console.log(`  Inserted:    ${result.inserted}`);
  console.log(`  Updated:     ${result.updated}`);
  console.log(`  Skipped:     ${result.skipped}`);
  console.log(`  Failed:      ${result.failed}`);
  if (result.errors.length > 0) {
    console.log(`  Errors:      ${result.errors.length}`);
    result.errors.slice(0, 5).forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.incident}: ${e.error}`);
    });
  }
  console.log('═══════════════════════════════════════════\n');

  // Step 5: Check ticket_raw count after
  const afterCount = await prisma.ticket_raw.count();
  console.log(`[5] ticket_raw count after: ${afterCount}\n`);

  // Step 6: Sample data
  const sample = await prisma.ticket_raw.findMany({
    take: 3,
    orderBy: { importedAt: 'desc' },
    select: {
      id_ticket: true,
      incident: true,
      sourceTable: true,
      sourceHash: true,
      syncBatchId: true,
      syncVersion: true,
      isActive: true,
      importedAt: true,
      lastSeenAt: true,
    },
  });

  if (sample.length > 0) {
    console.log('[6] Sample Records:');
    sample.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.incident}`);
      console.log(`     sourceTable: ${r.sourceTable}`);
      console.log(`     syncVersion: ${r.syncVersion}`);
      console.log(`     isActive:    ${r.isActive}`);
      console.log(`     importedAt:  ${r.importedAt?.toISOString()}`);
      console.log(`     lastSeenAt:  ${r.lastSeenAt?.toISOString()}`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
