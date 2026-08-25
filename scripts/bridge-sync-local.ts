// Tarik data terbaru dari Qosmic Bridge (nossa + nossa_closed) ke local dev,
// lalu projection-kan ke tabel `ticket`. Sekali jalan lalu keluar sendiri —
// tidak menyalakan worker permanen.
//
// Usage: npm run bridge:sync-local
import 'dotenv/config';
import { QueueEvents } from 'bullmq';
import { connectDB, prisma } from '@/app/libs/prisma';
import { waitForRedisReady } from '@/lib/workers/task-runner';
import {
  startBridgeWorkers,
  stopBridgeWorkers,
  ingestionQueue,
} from '@/lib/external-db/qosmic-bridge/bridge-queue';
import { runIncrementalProjection } from '@/lib/projection';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

const INGEST_TIMEOUT_MS = 30 * 60 * 1000;

async function ingestTable(
  table: 'nossa' | 'nossa_closed',
  queueEvents: QueueEvents,
): Promise<{ processed: number }> {
  const jobName = table === 'nossa' ? 'ingest-nossa' : 'ingest-nossa_closed';
  const jobId = `sync-local-${table}-${Date.now()}`;
  console.log(`→ Menarik ${table}...`);
  const job = await ingestionQueue.add(
    jobName,
    { table, correlationId: jobId },
    { jobId },
  );
  const result = (await job.waitUntilFinished(
    queueEvents,
    INGEST_TIMEOUT_MS,
  )) as { processed: number };
  console.log(`✓ ${table} selesai: ${result.processed} baris`);
  return result;
}

async function main() {
  console.log('=== Sync bridge -> local dev ===');

  console.log('1/4 Konek DB + Redis...');
  await connectDB();
  await waitForRedisReady(10_000);

  console.log('2/4 Menyalakan bridge worker sementara...');
  await startBridgeWorkers();
  const ingestionEvents = new QueueEvents('bridge-ingestion', {
    connection: REDIS_CONNECTION,
  });
  await ingestionEvents.waitUntilReady();

  try {
    await ingestTable('nossa', ingestionEvents);
    await ingestTable('nossa_closed', ingestionEvents);
  } finally {
    await ingestionEvents.close();
    console.log('3/4 Mematikan bridge worker...');
    await stopBridgeWorkers();
  }

  console.log('4/4 Projection ke tabel ticket...');
  const projection = await runIncrementalProjection();
  console.log('✓ Projection selesai:', {
    processed: projection.processed,
    inserted: projection.inserted,
    updated: projection.updated,
    failed: projection.failed,
  });

  console.log('=== Selesai ===');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Sync gagal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
