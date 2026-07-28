import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { recomputeSnapshotForDateRange } from '@/lib/aggregation/summary-snapshot';

function parseArgs() {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf('--from');
  const toIndex = args.indexOf('--to');

  const from = fromIndex !== -1 ? args[fromIndex + 1] : '';
  const to = toIndex !== -1 ? args[toIndex + 1] : '';

  if (!from || !to) {
    console.error('Usage: npm run agg:rebuild -- --from YYYY-MM-DD --to YYYY-MM-DD');
    process.exit(1);
  }

  return { from, to };
}

async function main() {
  const { from, to } = parseArgs();
  await connectDB();

  console.log(`Rebuilding aggregation from ${from} to ${to}...`);
  const start = Date.now();
  const rows = await recomputeSnapshotForDateRange(from, to);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Done. Updated ${rows} rows in ${elapsed}s`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
