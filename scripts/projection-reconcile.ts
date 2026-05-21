import 'dotenv/config';
import { getProjectionReconciliationReport } from '@/lib/projection';
import { prisma } from '@/app/libs/prisma';

async function main() {
  const report = await getProjectionReconciliationReport();
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
