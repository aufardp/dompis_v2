import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  VLOOKUP CHANNEL ANALYSIS');
  console.log('═══════════════════════════════════════════\n');

  // Get distinct channel values from ticket_raw
  const channels = await prisma.ticket_raw.groupBy({
    by: ['channel'],
    _count: true,
    orderBy: { _count: { channel: 'desc' } },
  });

  console.log('── Distinct channel values in ticket_raw ──');
  channels.forEach((c) => {
    console.log(`  channel: "${c.channel || '(null)'}" → ${c._count} records`);
  });

  // Get all vlookup entries
  const vlookups = await prisma.sourceVlookup.findMany({
    orderBy: { valueId: 'asc' },
  });

  console.log('\n── All source_vlookup entries ──');
  vlookups.forEach((v) => {
    console.log(`  valueId: ${v.valueId} | jenisTiket: ${v.jenisTiket || '(null)'} | customerTypeKey: ${v.customerTypeKey || '(null)'} | realmB2b: ${v.realmB2b || '(null)'} | flag1: ${v.flag1 || '(null)'}`);
  });

  // Check which channels from ticket_raw are NOT in vlookup
  const vlookupValueIds = new Set(vlookups.map((v) => String(v.valueId)));
  const missingChannels = channels.filter(
    (c) => c.channel && !vlookupValueIds.has(c.channel)
  );

  console.log('\n── Channels NOT in source_vlookup ──');
  missingChannels.forEach((c) => {
    console.log(`  channel: "${c.channel}" → ${c._count} records (NO MATCH)`);
  });

  const totalMissing = missingChannels.reduce((sum, c) => sum + c._count, 0);
  console.log(`\n  Total records with missing channel: ${totalMissing}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
