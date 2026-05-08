import cron, { ScheduledTask } from 'node-cron';

console.log('[worker] 1. Loading dotenv...');
import 'dotenv/config';

console.log('[worker] 2. Loading Prisma...');
import { prisma, connectDB } from '@/app/libs/prisma';

console.log('[worker] 3. Loading Redis...');
import { redis, closeRedis } from '@/lib/redis';

console.log('[worker] 4. Loading SSE publisher...');
import { publishSyncEvent } from '@/lib/sse-redis';
import { publishTicketInvalidate } from '@/lib/sse-redis';

console.log('[worker] 5. Loading cron tasks...');
import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { dispatchTechEvents } from '@/app/libs/integrations/dispatchTechEvents';
import { ClusterAutoAssignServiceV2 } from '@/app/libs/services/clusterAutoAssign.service';

console.log('[worker] All modules loaded successfully.');

let syncTask: ScheduledTask | null = null;
let pushTask: ScheduledTask | null = null;
let techEventsTask: ScheduledTask | null = null;
let autoAssignTask: ScheduledTask | null = null;
let isAutoAssignRunning = false;

async function withDbLock(lockName: string, fn: () => Promise<void>) {
  try {
    const result: any = await prisma.$queryRaw`
      SELECT GET_LOCK(${lockName}, 10) as locked
    `;

    if (!result?.[0]?.locked) {
      console.log(`[CRON] ${lockName} skipped (already running or timeout)`);
      return;
    }

    try {
      await fn();
    } finally {
      await prisma.$queryRaw`
        SELECT RELEASE_LOCK(${lockName})
      `;
    }
  } catch (error) {
    console.error(`[CRON] Lock error (${lockName}):`, error);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms),
    ),
  ]);
}

async function startWorker() {
  try {
    await connectDB();
  } catch (err) {
    console.error('[worker] DB connection failed, starting anyway:', err);
  }

  const cronEnabled = process.env.CRON_ENABLED === 'true';

  if (cronEnabled) {
    syncTask = cron.schedule('*/1 * * * *', async () => {
      console.log('[CRON] Running sync...');
      await publishSyncEvent('start');

      try {
        await withDbLock('sync_lock', async () => {
          try {
            const result = await withTimeout(syncSpreadsheet(), 3 * 60 * 1000);
            console.log('[CRON] Sync done:', result.inserted, 'inserted,', result.updated, 'updated');
            await publishSyncEvent('complete', {
              inserted: result.inserted,
              updated: result.updated,
            });
          } catch (error) {
            console.error('[CRON] Sync inner error:', error);
            await publishSyncEvent('error', { error: String(error) });
          }
        });
      } catch (error) {
        console.error('[CRON] Sync lock error:', error);
      }
    });

    pushTask = cron.schedule('*/10 * * * *', async () => {
      console.log('[CRON] Running push...');

      try {
        await withDbLock('push_lock', async () => {
          try {
            const result = await withTimeout(pushSpreadsheet(), 5 * 60 * 1000);
            console.log('[CRON] Push result:', result);
          } catch (error) {
            console.error('[CRON] Push inner error:', error);
          }
        });
      } catch (error) {
        console.error('[CRON] Push lock error:', error);
      }
    });

    let isRunning = false;

    const runTechEvents = async () => {
      if (isRunning) return;
      isRunning = true;

      console.log('[CRON] Running tech events dispatch...');

      try {
        await withDbLock('tech_events_lock', async () => {
          const result = await withTimeout(dispatchTechEvents(), 120 * 1000);
          console.log('[CRON] Tech events result:', result);
        });
      } catch (error) {
        console.error('[CRON] Tech events error:', error);
      } finally {
        isRunning = false;
      }
    };

    techEventsTask = cron.schedule('*/2 * * * *', runTechEvents);

    autoAssignTask = cron.schedule('*/5 * * * *', async () => {
      if (isAutoAssignRunning) {
        console.log('[CRON] Auto-assign skipped - already running');
        return;
      }

      isAutoAssignRunning = true;
      console.log('[CRON] Running auto-assign...');

      try {
        await withDbLock('auto_assign_lock', async () => {
          try {
            const allSAs = await prisma.service_area.findMany({
              select: { id_sa: true },
            });

            if (allSAs.length > 0) {
              const saIds = allSAs.map((s) => s.id_sa);
              const currentIdx = Math.floor(Date.now() / (5 * 60 * 1000)) % saIds.length;
              const currentSA = [saIds[currentIdx]];

              console.log(`[CRON] Auto-assign: processing SA ${currentSA[0]} (${currentIdx + 1}/${saIds.length})`);

              const result = await withTimeout(
                ClusterAutoAssignServiceV2.runBatchV2(currentSA, 0),
                60 * 1000,
              );

              if (result.assigned > 0) {
                console.log(`[CRON] Auto-assign: ${result.assigned}/${result.total} tickets assigned for SA ${currentSA[0]}`);
              } else {
                console.log(`[CRON] Auto-assign: 0/${result.total} tickets assigned for SA ${currentSA[0]}`);
              }
            } else {
              console.log('[CRON] Auto-assign: no service areas found');
            }
          } catch (error) {
            console.error('[CRON] Auto-assign inner error:', error);
          }
        });
      } catch (error) {
        console.error('[CRON] Auto-assign error:', error);
      } finally {
        isAutoAssignRunning = false;
        console.log('[CRON] Auto-assign finished, flag reset');
      }
    });

    console.log('[CRON] Scheduled: sync(1m), push(10m), tech-events(2m), auto-assign(5m) with SA rotation');
  } else {
    console.log('[CRON] Disabled (set CRON_ENABLED=true)');
  }

  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal} — shutting down...`);

    syncTask?.stop();
    pushTask?.stop();
    techEventsTask?.stop();
    autoAssignTask?.stop();
    console.log('[worker] Cron tasks stopped');

    await Promise.allSettled([
      prisma.$disconnect().then(() => console.log('[worker] Prisma disconnected')),
      redis.quit().then(() => console.log('[worker] Redis disconnected')),
    ]);

    console.log('[worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGUSR2', () => void shutdown('SIGUSR2'));
}

startWorker().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});