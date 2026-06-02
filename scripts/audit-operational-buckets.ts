import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { OPERATIONAL_BUCKET_DEFINITIONS, type OperationalBucketKey } from '@/app/config/operational-buckets';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { buildOperationalBucketWhere } from '@/app/libs/services/ticket-buckets';

const BUCKETS: OperationalBucketKey[] = [
  'kpi_customer',
  'kpi_proactive',
  'non_kpi_unspec',
  'non_technical',
  'sqm_update',
  'obsolete',
];

async function countWithPrisma(bucket: OperationalBucketKey): Promise<number> {
  const dailyWhere = await DailyTicketService.buildDailyTicketWhere(
    'superadmin',
    1,
    { globalScope: true },
  );

  return prisma.ticket.count({
    where: {
      AND: [dailyWhere, buildOperationalBucketWhere(bucket)],
    },
  });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  OPERATIONAL BUCKET AUDIT');
  console.log('═══════════════════════════════════════════\n');

  await connectDB();
  const summaryMatrix = await DailyTicketService.getKpiBucketSummaryMatrix(
    'superadmin',
    1,
    { globalScope: true },
  );

  const results: Array<{
    bucket: OperationalBucketKey;
    label: string;
    dailyRowCount: number;
    summaryCount: number;
    diff: number;
  }> = [];

  for (const bucket of BUCKETS) {
    const [dailyRowCount] = await Promise.all([countWithPrisma(bucket)]);
    const summaryCount = summaryMatrix.all[bucket].total;

    results.push({
      bucket,
      label: OPERATIONAL_BUCKET_DEFINITIONS[bucket].label,
      dailyRowCount,
      summaryCount,
      diff: summaryCount - dailyRowCount,
    });
  }

  console.table(results);

  const mismatches = results.filter((item) => item.diff !== 0);
  if (mismatches.length > 0) {
    console.log('\nMISMATCHES:');
    for (const item of mismatches) {
      console.log(
        `- ${item.bucket} (${item.label}): dailyRow=${item.dailyRowCount}, summary=${item.summaryCount}, diff=${item.diff}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log('\nAll operational bucket counts are aligned.');
  }
}

main()
  .catch((error) => {
    console.error('[Audit] Fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
