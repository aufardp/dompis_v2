import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  TICKET vs TICKET_RAW COMPARISON');
  console.log('═══════════════════════════════════════════\n');

  // Check the specific sample tickets from null analysis
  const sampleIncidents = [
    'INC48016131', 'INC48046087', 'INC48013238', 'INC48035096', 'INC48016683',
    'INC48075906', 'INC48048917', 'INC48031678', 'INC48076815', 'INC47990220',
  ];

  console.log('── ticket_raw data for sample incidents ──');
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
      importedAt: true,
    },
  });

  for (const r of rawRecords) {
    console.log(`\n  ${r.incident}`);
    console.log(`     channel: ${r.channel || '(null)'}`);
    console.log(`     classification_path: ${r.classification_path || '(null)'}`);
    console.log(`     customer_segment: ${r.customer_segment || '(null)'}`);
    console.log(`     source_ticket: ${r.source_ticket || '(null)'}`);
    console.log(`     customer_type: ${r.customer_type || '(null)'}`);
    console.log(`     service_type: ${r.service_type || '(null)'}`);
    console.log(`     importedAt: ${r.importedAt?.toISOString() || '(null)'}`);
  }

  console.log('\n\n── ticket data for same incidents ──');
  const ticketRecords = await prisma.ticket.findMany({
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
      jenis_tiket_1: true,
      jenis_tiket_2: true,
      synced_at: true,
    },
  });

  for (const t of ticketRecords) {
    console.log(`\n  ${t.incident}`);
    console.log(`     channel: ${t.channel || '(null)'}`);
    console.log(`     classification_path: ${t.classification_path || '(null)'}`);
    console.log(`     jenis_tiket_1: ${t.jenis_tiket_1 || '(null)'}`);
    console.log(`     jenis_tiket_2: ${t.jenis_tiket_2 || '(null)'}`);
    console.log(`     synced_at: ${t.synced_at?.toISOString() || '(null)'}`);
  }

  // Check how many tickets were synced before jenis_tiket logic existed
  const oldTickets = await prisma.ticket.count({
    where: {
      jenis_tiket_1: null,
      synced_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  const recentTickets = await prisma.ticket.count({
    where: {
      jenis_tiket_1: null,
      synced_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  console.log(`\n\n── Null jenis_tiket by sync age ──`);
  console.log(`  Synced > 24h ago: ${oldTickets}`);
  console.log(`  Synced < 24h ago: ${recentTickets}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
