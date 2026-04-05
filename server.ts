import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import 'dotenv/config';
import cron, { ScheduledTask } from 'node-cron';
import prisma, { connectWithRetry } from '@/app/libs/prisma';
import { closePool } from '@/app/libs/db';

import { closeRedis } from '@/lib/redis';
import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { dispatchTechEvents } from '@/app/libs/integrations/dispatchTechEvents';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Simpan referensi cron tasks untuk shutdown
let syncTask: ScheduledTask | null = null;
let pushTask: ScheduledTask | null = null;
let techEventsTask1: ScheduledTask | null = null;
let techEventsTask2: ScheduledTask | null = null;

/**
 * DB LOCK WRAPPER
 * Mencegah cron double jalan jika menggunakan multiple instance/replica
 */
async function withDbLock(lockName: string, fn: () => Promise<void>) {
  try {
    const result: any = await prisma.$queryRawUnsafe(
      `SELECT GET_LOCK('${lockName}', 0) as locked`,
    );

    if (!result?.[0]?.locked) {
      console.log(`[CRON] ${lockName} skipped (already running)`);
      return;
    }

    try {
      await fn();
    } finally {
      await prisma.$queryRawUnsafe(`SELECT RELEASE_LOCK('${lockName}')`);
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
    await connectWithRetry();
  } catch (err) {
    console.error('[Server] DB connection failed, starting anyway:', err);
  }

  await app.prepare();
  console.log('Next.js app prepared');

  const cronEnabled = process.env.CRON_ENABLED === 'true';

  if (cronEnabled) {
    /**
     * SYNC — setiap 3 menit
     */
    syncTask = cron.schedule('*/3 * * * *', async () => {
      console.log('[CRON] Running sync...');
      await withDbLock('sync_lock', async () => {
        try {
          const result = await withTimeout(syncSpreadsheet(), 3 * 60 * 1000);
          console.log('[CRON] Sync result:', result);
        } catch (error) {
          console.error('[CRON] Sync error:', error);
        }
      });
    });

    /**
     * PUSH — setiap 10 menit
     */
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

    /**
     * TECH EVENTS — setiap 30 detik
     */
    const runTechEvents = async () => {
      console.log('[CRON] Running tech events dispatch...');
      await withDbLock('tech_events_lock', async () => {
        try {
          const result = await withTimeout(dispatchTechEvents(), 30 * 1000);
          console.log('[CRON] Tech events result:', result);
        } catch (error) {
          console.error('[CRON] Tech events error:', error);
        }
      });
    };

    techEventsTask1 = cron.schedule('* * * * *', runTechEvents);
    techEventsTask2 = cron.schedule('* * * * *', () => {
      setTimeout(runTechEvents, 30000);
    });

    console.log('[CRON] Scheduled: sync(3m), push(10m), tech-events(30s)');
  } else {
    console.log('[CRON] Disabled (set CRON_ENABLED=true)');
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  /**
   * Graceful shutdown - complete
   */
  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal} — starting graceful shutdown...`);

    // 1. Stop all cron jobs
    syncTask?.stop();
    pushTask?.stop();
    techEventsTask1?.stop();
    techEventsTask2?.stop();
    console.log('[Server] Cron jobs stopped');

    // 2. Stop HTTP server
    await new Promise<void>((resolve) => {
      const forceClose = setTimeout(() => {
        console.warn('[Server] Force closing — timeout reached');
        resolve();
      }, 10_000);

      server.close(() => {
        clearTimeout(forceClose);
        console.log('[Server] HTTP server closed');
        resolve();
      });
    });

    // 3. Disconnect all connections
    await Promise.allSettled([
      prisma
        .$disconnect()
        .then(() => console.log('[Server] Prisma disconnected')),
      closeRedis(),
      closePool().then(() => console.log('[Server] mysql2 pool closed')),
    ]);

    console.log('[Server] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGUSR2', () => void shutdown('SIGUSR2')); // PM2 reload
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
