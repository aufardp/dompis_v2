import 'dotenv/config';
import { runProjection } from '../lib/projection';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  PROJECTION TEST');
  console.log('═══════════════════════════════════════════\n');

  // Step 1: Check ticket_raw count
  const rawCount = await prisma.ticket_raw.count({
    where: { isActive: true },
  });
  console.log(`[1] Active ticket_raw records: ${rawCount}\n`);

  // Step 2: Check ticket count before
  const beforeCount = await prisma.ticket.count();
  console.log(`[2] ticket count before: ${beforeCount}\n`);

  // Step 3: Run projection
  console.log('[3] Running Projection...\n');
  const start = Date.now();
  const result = await runProjection();
  const duration = Date.now() - start;

  console.log('\n═══════════════════════════════════════════');
  console.log('  PROJECTION RESULT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Duration:    ${duration}ms`);
  console.log(`  Processed:   ${result.processed}`);
  console.log(`  Inserted:    ${result.inserted}`);
  console.log(`  Updated:     ${result.updated}`);
  console.log(`  Skipped:     ${result.skipped}`);
  console.log(`  Failed:      ${result.failed}`);
  console.log(`  Set to Open: ${result.setToOpen}`);
  console.log(`  Set to Close:${result.setToClose}`);
  console.log(`  Protected:   ${result.protected}`);
  if (result.errors.length > 0) {
    console.log(`  Errors:      ${result.errors.length}`);
    result.errors.slice(0, 5).forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.incident}: ${e.error}`);
    });
  }
  console.log('═══════════════════════════════════════════\n');

  // Step 4: Check ticket count after
  const afterCount = await prisma.ticket.count();
  console.log(`[4] ticket count after: ${afterCount}\n`);

  // Step 5: Sample data
  const sample = await prisma.ticket.findMany({
    take: 3,
    orderBy: { synced_at: 'desc' },
    select: {
      id_ticket: true,
      incident: true,
      status_update: true,
      jenis_tiket_1: true,
      jenis_tiket_2: true,
      flagging_manja: true,
      synced_at: true,
      sync_date: true,
    },
  });

  if (sample.length > 0) {
    console.log('[5] Sample Records:');
    sample.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.incident}`);
      console.log(`     status_update:  ${r.status_update}`);
      console.log(`     jenis_tiket_1:  ${r.jenis_tiket_1}`);
      console.log(`     jenis_tiket_2:  ${r.jenis_tiket_2}`);
      console.log(`     flagging_manja: ${r.flagging_manja}`);
      console.log(`     synced_at:      ${r.synced_at?.toISOString()}`);
      console.log(`     sync_date:      ${r.sync_date?.toISOString()}`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
