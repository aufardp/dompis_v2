import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  CHECK TICKET EXISTENCE');
  console.log('═══════════════════════════════════════════\n');

  const sampleIncidents = [
    'INC47423550', 'INC47448887', 'INC47368567', 'INC47338334', 'INC47405604',
  ];

  console.log('── Checking if tickets exist in ticket table ──');
  for (const incident of sampleIncidents) {
    const ticket = await prisma.ticket.findUnique({
      where: { incident },
      select: {
        id_ticket: true,
        incident: true,
        jenis_tiket_1: true,
        jenis_tiket_2: true,
        channel: true,
        classification_path: true,
      },
    });

    if (ticket) {
      console.log(`\n  ${incident}: FOUND`);
      console.log(`    jenis_tiket_1: ${ticket.jenis_tiket_1 || '(null)'}`);
      console.log(`    jenis_tiket_2: ${ticket.jenis_tiket_2 || '(null)'}`);
      console.log(`    channel: ${ticket.channel || '(null)'}`);
      console.log(`    classification_path: ${ticket.classification_path || '(null)'}`);
    } else {
      console.log(`\n  ${incident}: NOT FOUND in ticket table`);
    }
  }

  // Count how many ticket_raw don't have matching ticket
  const rawCount = await prisma.ticket_raw.count({ where: { isActive: true } });
  const ticketCount = await prisma.ticket.count();

  console.log(`\n\n── Counts ──`);
  console.log(`  ticket_raw (active): ${rawCount}`);
  console.log(`  ticket: ${ticketCount}`);
  console.log(`  Difference: ${rawCount - ticketCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
