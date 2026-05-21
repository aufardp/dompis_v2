import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  JENIS TIKET NULL ANALYSIS');
  console.log('═══════════════════════════════════════════\n');

  const totalNullBoth = await prisma.ticket.count({
    where: { jenis_tiket_1: null, jenis_tiket_2: null },
  });
  const totalNull1 = await prisma.ticket.count({
    where: { jenis_tiket_1: null },
  });
  const totalNull2 = await prisma.ticket.count({
    where: { jenis_tiket_2: null },
  });
  const totalTickets = await prisma.ticket.count();

  console.log(`Total tickets: ${totalTickets}`);
  console.log(`jenis_tiket_1 null: ${totalNull1} (${((totalNull1 / totalTickets) * 100).toFixed(1)}%)`);
  console.log(`jenis_tiket_2 null: ${totalNull2} (${((totalNull2 / totalTickets) * 100).toFixed(1)}%)`);
  console.log(`Both null: ${totalNullBoth} (${((totalNullBoth / totalTickets) * 100).toFixed(1)}%)\n`);

  const segments = await prisma.ticket.groupBy({
    by: ['customer_segment'],
    where: { jenis_tiket_1: null, jenis_tiket_2: null },
    _count: true,
    orderBy: { _count: { customer_segment: 'desc' } },
  });

  console.log('── Null by Customer Segment ──');
  segments.forEach((s) => {
    console.log(`  ${s.customer_segment || '(empty)'}: ${s._count}`);
  });
  console.log('');

  const sources = await prisma.ticket.groupBy({
    by: ['source_ticket'],
    where: { jenis_tiket_1: null, jenis_tiket_2: null },
    _count: true,
    orderBy: { _count: { source_ticket: 'desc' } },
  });

  console.log('── Null by Source Ticket ──');
  sources.forEach((s) => {
    console.log(`  ${s.source_ticket || '(empty)'}: ${s._count}`);
  });
  console.log('');

  const classifications = await prisma.ticket.groupBy({
    by: ['classification_path'],
    where: { jenis_tiket_1: null, jenis_tiket_2: null },
    _count: true,
    orderBy: { _count: { classification_path: 'desc' } },
  });

  console.log('── Null by Classification Path (top 10) ──');
  classifications.slice(0, 10).forEach((s) => {
    console.log(`  ${s.classification_path || '(empty)'}: ${s._count}`);
  });
  console.log('');

  const samples = await prisma.ticket.findMany({
    where: { jenis_tiket_1: null, jenis_tiket_2: null },
    take: 10,
    select: {
      incident: true,
      customer_segment: true,
      channel: true,
      classification_path: true,
      customer_type: true,
      service_type: true,
      service_no: true,
      source_ticket: true,
      realm: true,
    },
  });

  console.log('── Sample Tickets (first 10 with null both) ──');
  samples.forEach((t, i) => {
    console.log(`\n  ${i + 1}. ${t.incident}`);
    console.log(`     customer_segment:  ${t.customer_segment || '(null)'}`);
    console.log(`     channel:           ${t.channel || '(null)'}`);
    console.log(`     classification:    ${t.classification_path || '(null)'}`);
    console.log(`     customer_type:     ${t.customer_type || '(null)'}`);
    console.log(`     service_type:      ${t.service_type || '(null)'}`);
    console.log(`     service_no:        ${t.service_no || '(null)'}`);
    console.log(`     source_ticket:     ${t.source_ticket || '(null)'}`);
    console.log(`     realm:             ${t.realm || '(null)'}`);
  });

  const vlookupCount = await prisma.sourceVlookup.count();
  const vlookupByValueId = await prisma.sourceVlookup.groupBy({
    by: ['jenisTiket'],
    _count: true,
  });

  console.log('\n\n── Source Vlookup Coverage ──');
  console.log(`  Total vlookup rows: ${vlookupCount}`);
  console.log('  Jenis tiket distribution:');
  vlookupByValueId.forEach((v) => {
    console.log(`    ${v.jenisTiket || '(null)'}: ${v._count}`);
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
