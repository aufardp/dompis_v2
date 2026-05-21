import 'dotenv/config';
import { prisma } from '../app/libs/prisma';
import { classifyJenisFromVlookup, resetVlookupCache, refreshVlookupCache } from '../lib/classify-jenis-vlookup';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  TEST MANUAL UPDATE');
  console.log('═══════════════════════════════════════════\n');

  resetVlookupCache();
  await refreshVlookupCache();

  const incident = 'INC47448887';

  // 1. Read from ticket_raw
  const raw = await prisma.ticket_raw.findUnique({
    where: { incident },
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

  console.log('── ticket_raw data ──');
  console.log(`  channel: "${raw?.channel}"`);
  console.log(`  classification_path: "${raw?.classification_path}"`);
  console.log(`  customer_segment: "${raw?.customer_segment}"`);
  console.log(`  customer_type: "${raw?.customer_type}"`);

  // 2. Classify
  const result = await classifyJenisFromVlookup({
    channel: raw?.channel || null,
    classification_path: raw?.classification_path || null,
    customer_type: raw?.customer_type || null,
    customer_segment: raw?.customer_segment || null,
    service_type: raw?.service_type || null,
    service_no: raw?.service_no || null,
    source_ticket: raw?.source_ticket || null,
    realm: raw?.realm || null,
  });

  console.log(`\n── Classification result ──`);
  console.log(`  jenis_tiket_1: "${result.jenis_tiket_1}"`);
  console.log(`  jenis_tiket_2: "${result.jenis_tiket_2}"`);

  // 3. Check ticket before
  const ticketBefore = await prisma.ticket.findUnique({
    where: { incident },
    select: { id_ticket: true, jenis_tiket_1: true, jenis_tiket_2: true },
  });
  console.log(`\n── Ticket BEFORE ──`);
  console.log(`  jenis_tiket_1: "${ticketBefore?.jenis_tiket_1}"`);
  console.log(`  jenis_tiket_2: "${ticketBefore?.jenis_tiket_2}"`);

  // 4. Update
  const updateResult = await prisma.ticket.updateMany({
    where: { incident },
    data: {
      jenis_tiket_1: result.jenis_tiket_1,
      jenis_tiket_2: result.jenis_tiket_2,
    },
  });
  console.log(`\n── Update result ──`);
  console.log(`  count: ${updateResult.count}`);

  // 5. Check ticket after
  const ticketAfter = await prisma.ticket.findUnique({
    where: { incident },
    select: { id_ticket: true, jenis_tiket_1: true, jenis_tiket_2: true },
  });
  console.log(`\n── Ticket AFTER ──`);
  console.log(`  jenis_tiket_1: "${ticketAfter?.jenis_tiket_1}"`);
  console.log(`  jenis_tiket_2: "${ticketAfter?.jenis_tiket_2}"`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
