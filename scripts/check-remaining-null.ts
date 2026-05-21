import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  CHECK REMAINING NULL TICKETS IN ticket_raw');
  console.log('═══════════════════════════════════════════\n');

  const sampleIncidents = [
    'INC47423550', 'INC47448887', 'INC47368567', 'INC47338334', 'INC47405604',
  ];

  console.log('── ticket_raw data for remaining null tickets ──');
  const rawRecords = await prisma.ticket_raw.findMany({
    where: { incident: { in: sampleIncidents } },
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

  for (const r of rawRecords) {
    console.log(`\n  ${r.incident}`);
    console.log(`     channel: ${r.channel || '(null)'}`);
    console.log(`     classification_path: ${r.classification_path || '(null)'}`);
    console.log(`     customer_segment: ${r.customer_segment || '(null)'}`);
    console.log(`     source_ticket: ${r.source_ticket || '(null)'}`);
    console.log(`     customer_type: ${r.customer_type || '(null)'}`);
  }

  // Count how many ticket_raw have null channel/classification
  const rawNullChannel = await prisma.ticket_raw.count({
    where: { isActive: true, channel: null },
  });
  const rawNullClass = await prisma.ticket_raw.count({
    where: { isActive: true, classification_path: null },
  });
  const rawTotal = await prisma.ticket_raw.count({
    where: { isActive: true },
  });

  console.log(`\n\n── ticket_raw null counts ──`);
  console.log(`  Total active: ${rawTotal}`);
  console.log(`  channel NULL: ${rawNullChannel}`);
  console.log(`  classification_path NULL: ${rawNullClass}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
