import 'dotenv/config';
import { runInitialProjection } from '@/lib/projection';
import { prisma } from '@/app/libs/prisma';

async function main() {
  const controller = new AbortController();
  const result = await runInitialProjection(controller.signal);
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
