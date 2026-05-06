import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

// --- Debug: isolate which import throws the JSON parse error ---
console.log('[boot] 1. Loading dotenv...');
import 'dotenv/config';

console.log('[boot] 2. Loading Prisma...');
import { prisma, connectDB } from '@/app/libs/prisma';

console.log('[boot] 3. Loading Redis...');
import { closePool } from '@/app/libs/db';
import { closeRedis } from '@/lib/redis';

console.log('[boot] 4. Loading Google Sheets sync/push...');
import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { broadcastSyncEvent } from '@/app/libs/sseBroadcast';

console.log('[boot] 5. Loading tech events dispatch...');
import { dispatchTechEvents } from '@/app/libs/integrations/dispatchTechEvents';
import cron, { ScheduledTask } from 'node-cron';

console.log('[boot] 6. Loading auto-assign service...');
import { ClusterAutoAssignServiceV2 } from '@/app/libs/services/clusterAutoAssign.service';

console.log('[boot] All modules loaded successfully.');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Cron references
let syncTask: ScheduledTask | null = null;
let pushTask: ScheduledTask | null = null;
let techEventsTask: ScheduledTask | null = null;
let autoAssignTask: ScheduledTask | null = null;
let isAutoAssignRunning = false;

/**
 * DB LOCK (SAFE)
 */
async function withDbLock(lockName: string, fn: () => Promise<void>) {
  try {
    const result: any = await prisma.$queryRaw`
      SELECT GET_LOCK(${lockName}, 0) as locked
    `;

    if (!result?.[0]?.locked) {
      console.log(`[CRON] ${lockName} skipped (already running)`);
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

/**
 * TIMEOUT WRAPPER
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms),
    ),
  ]);
}

async function startServer() {
  try {
    await connectDB();
  } catch (err) {
    console.error('[Server] DB connection failed, starting anyway:', err);
  }

  await app.prepare();
  console.log('Next.js app prepared');

  const cronEnabled = process.env.CRON_ENABLED === 'true';

  if (cronEnabled) {
    // 1 menit
    syncTask = cron.schedule('*/1 * * * *', async () => {
      console.log('[CRON] Running sync...');
      broadcastSyncEvent('start');
      await withDbLock('sync_lock', async () => {
        try {
          const result = await withTimeout(syncSpreadsheet(), 3 * 60 * 1000);
          console.log('[CRON] Sync done:', result.inserted, 'inserted,', result.updated, 'updated');
          broadcastSyncEvent('complete', {
            inserted: result.inserted,
            updated: result.updated,
          });
        } catch (error) {
          console.error('[CRON] Sync failed:', error);
          broadcastSyncEvent('error', { error: String(error) });
        }
      });
    });

    // 10 menit
    pushTask = cron.schedule('*/10 * * * *', async () => {
      console.log('[CRON] Running push...');
      await withDbLock('push_lock', async () => {
        try {
          const result = await withTimeout(pushSpreadsheet(), 5 * 60 * 1000);
          console.log('[CRON] Push result:', result);
        } catch (error) {
          console.error('[CRON] Push error:', error);
        }
      });
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

    // 5 menit - auto-assign dengan rotasi workzone
    autoAssignTask = cron.schedule('*/5 * * * *', async () => {
      if (isAutoAssignRunning) return;
      isAutoAssignRunning = true;

      console.log('[CRON] Running auto-assign...');
      await withDbLock('auto_assign_lock', async () => {
        try {
          // Dynamic workzone rotation - ambil semua SA dan rotasi berdasarkan waktu
          const allSAs = await prisma.service_area.findMany({
            select: { id_sa: true },
          });

          if (allSAs.length > 0) {
            const saIds = allSAs.map(s => s.id_sa);
            // Rotasi: setiap 5 menit, proses workzone berbeda
            const currentIdx = Math.floor(Date.now() / (5 * 60 * 1000)) % saIds.length;
            const currentSA = [saIds[currentIdx]];

            console.log(`[CRON] Auto-assign: processing SA ${currentSA[0]} (${currentIdx + 1}/${saIds.length})`);

            const result = await withTimeout(
              ClusterAutoAssignServiceV2.runBatchV2(currentSA, 0),
              60 * 1000,
            );

            if (result.assigned > 0) {
              console.log(
                `[CRON] Auto-assign: ${result.assigned}/${result.total} tickets assigned for SA ${currentSA[0]}`,
              );
            }
          } else {
            console.log('[CRON] Auto-assign: no service areas found');
          }
        } catch (error) {
          console.error('[CRON] Auto-assign error:', error);
        }
      });

      isAutoAssignRunning = false;
    });

    console.log('[CRON] Scheduled: sync(1m), push(10m), tech-events(2m), auto-assign(5m) with SA rotation');
  } else {
    console.log('[CRON] Disabled (set CRON_ENABLED=true)');
  }

  /**
   * HTTP SERVER - use Next.js default handling with proper URL parsing
   */
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  /**
   * GRACEFUL SHUTDOWN
   */
  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal} — starting shutdown...`);

    // Stop cron
    syncTask?.stop();
    pushTask?.stop();
    techEventsTask?.stop();
    autoAssignTask?.stop();
    console.log('[Server] Cron stopped');

    // Stop HTTP server
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[Server] Force close (timeout)');
        resolve();
      }, 10000);

      server.close(() => {
        clearTimeout(timeout);
        console.log('[Server] HTTP server closed');
        resolve();
      });
    });

    // Close connections
    await Promise.allSettled([
      prisma
        .$disconnect()
        .then(() => console.log('[Server] Prisma disconnected')),
      closeRedis(),
      closePool().then(() => console.log('[Server] MySQL pool closed')),
    ]);

    console.log('[Server] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGUSR2', () => void shutdown('SIGUSR2')); // PM2
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
