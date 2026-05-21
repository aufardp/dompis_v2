import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  TICKET_RAW FIELD ANALYSIS');
  console.log('═══════════════════════════════════════════\n');

  const totalRaw = await prisma.ticket_raw.count();
  console.log(`Total ticket_raw: ${totalRaw}\n`);

  const rawSamples = await prisma.ticket_raw.findMany({
    take: 5,
    select: {
      incident: true,
      channel: true,
      classification_path: true,
      customer_segment: true,
      source_ticket: true,
      customer_type: true,
      service_type: true,
      service_no: true,
      realm: true,
    },
  });

  console.log('── Sample ticket_raw records ──');
  rawSamples.forEach((r, i) => {
    console.log(`\n  ${i + 1}. ${r.incident}`);
    console.log(`     channel: ${r.channel || '(null)'}`);
    console.log(`     classification_path: ${r.classification_path || '(null)'}`);
    console.log(`     customer_segment: ${r.customer_segment || '(null)'}`);
    console.log(`     source_ticket: ${r.source_ticket || '(null)'}`);
    console.log(`     customer_type: ${r.customer_type || '(null)'}`);
    console.log(`     service_type: ${r.service_type || '(null)'}`);
    console.log(`     service_no: ${r.service_no || '(null)'}`);
    console.log(`     realm: ${r.realm || '(null)'}`);
  });

  const rawNullChannel = await prisma.ticket_raw.count({
    where: { channel: null },
  });
  const rawNullClass = await prisma.ticket_raw.count({
    where: { classification_path: null },
  });

  console.log(`\n\n── Null counts in ticket_raw ──`);
  console.log(`  channel NULL: ${rawNullChannel} (${((rawNullChannel / totalRaw) * 100).toFixed(1)}%)`);
  console.log(`  classification_path NULL: ${rawNullClass} (${((rawNullClass / totalRaw) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
