import 'dotenv/config';
import { getIngestionReconciliationReport } from '@/lib/ingestion';
import { prisma } from '@/app/libs/prisma';

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  );
}

async function main() {
  const report = await getIngestionReconciliationReport();
  console.log(stringifyWithBigInt(report));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
