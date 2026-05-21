import 'dotenv/config';
import { runInitialLoad } from '@/lib/ingestion';
import { prisma } from '@/app/libs/prisma';
import { waitForRedisReady } from '@/lib/workers/task-runner';

async function main() {
  await waitForRedisReady(5_000);
  const result = await runInitialLoad(new AbortController().signal);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
