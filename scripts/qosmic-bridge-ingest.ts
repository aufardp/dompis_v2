import 'dotenv/config';
import { waitForRedisReady } from '@/lib/workers/task-runner';
import { logger } from '@/lib/observability/logger';

const tableArg = process.argv[2]?.trim().toLowerCase();

async function main() {
  if (!tableArg || !['nossa', 'nossa_closed'].includes(tableArg)) {
    console.error('Usage: npm run bridge:ingest -- nossa|nossa_closed');
    process.exit(1);
  }

  await waitForRedisReady(5_000);

  const { ingestionQueue } = await import('@/lib/external-db/qosmic-bridge/bridge-queue');
  const jobName = tableArg === 'nossa' ? 'ingest:nossa' : 'ingest:nossa_closed';
  const jobId = `ingest-${tableArg}-manual-${Date.now()}`;

  await ingestionQueue.add(jobName, { table: tableArg, correlationId: jobId }, { jobId });

  console.log(`✅ Job "${jobName}" pushed to bridge-ingestion queue (id: ${jobId})`);
  console.log(`   Bridge worker akan memproses ${tableArg} (open ${tableArg === 'nossa' ? '' : 'closed '}tickets).`);
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exitCode = 1;
});
