import 'dotenv/config';
import { prisma } from '../app/libs/prisma';
import { classifyJenisFromVlookup, resetVlookupCache, refreshVlookupCache } from '../lib/classify-jenis-vlookup';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  DEBUG JENIS TIKET CLASSIFICATION');
  console.log('═══════════════════════════════════════════\n');

  resetVlookupCache();
  await refreshVlookupCache();

  const testCases = [
    {
      incident: 'INC47423550',
      channel: '21',
      classification_path: 'Z_PERMINTAAN_031',
      customer_segment: 'PL-TSEL',
      source_ticket: 'CUSTOMER',
      customer_type: 'HVC_GOLD',
      service_type: 'INTERNET',
      service_no: '152702328611',
      realm: 'telkom.net',
    },
    {
      incident: 'INC47448887',
      channel: '50',
      classification_path: 'C_PROACTIVE_005_001',
      customer_segment: 'PL-TSEL',
      source_ticket: 'PROACTIVE',
      customer_type: 'HVC_GOLD',
      service_type: 'INTERNET',
      service_no: '152644203966',
      realm: 'telkom.net',
    },
  ];

  for (const tc of testCases) {
    console.log(`── ${tc.incident} ──`);
    console.log(`  Input:`);
    console.log(`    channel: "${tc.channel}"`);
    console.log(`    classification_path: "${tc.classification_path}"`);
    console.log(`    customer_segment: "${tc.customer_segment}"`);
    console.log(`    source_ticket: "${tc.source_ticket}"`);
    console.log(`    customer_type: "${tc.customer_type}"`);

    const result = await classifyJenisFromVlookup({
      channel: tc.channel,
      classification_path: tc.classification_path,
      customer_type: tc.customer_type,
      customer_segment: tc.customer_segment,
      service_type: tc.service_type,
      service_no: tc.service_no,
      source_ticket: tc.source_ticket,
      realm: tc.realm,
    });

    console.log(`  Result: jenis_tiket_1="${result.jenis_tiket_1}", jenis_tiket_2="${result.jenis_tiket_2}"`);

    // Check vlookup for channel
    const channelId = parseInt(tc.channel || '', 10);
    if (!isNaN(channelId)) {
      const vlookup = await prisma.sourceVlookup.findFirst({
        where: { valueId: channelId },
      });
      console.log(`  Vlookup for channel ${channelId}: jenisTiket="${vlookup?.jenisTiket || '(null)'}"`);
    }

    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
