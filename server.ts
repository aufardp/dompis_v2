import { createServer } from 'http';
import next from 'next';
import 'dotenv/config';
import cron, { ScheduledTask } from 'node-cron';

import { prisma, connectDB } from '@/app/libs/prisma';
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

// Cron references
let syncTask: ScheduledTask | null = null;
let pushTask: ScheduledTask | null = null;
let techEventsTask: ScheduledTask | null = null;

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
     * TECH EVENTS — setiap 30 detik (ANTI OVERLAP)
     */
    let isRunning = false;

    const runTechEvents = async () => {
      if (isRunning) return;
      isRunning = true;

      console.log('[CRON] Running tech events dispatch...');

      try {
        await withDbLock('tech_events_lock', async () => {
          const result = await withTimeout(dispatchTechEvents(), 30 * 1000);
          console.log('[CRON] Tech events result:', result);
        });
      } catch (error) {
        console.error('[CRON] Tech events error:', error);
      } finally {
        isRunning = false;
      }
    };

    techEventsTask = cron.schedule('*/30 * * * * *', runTechEvents);

    console.log('[CRON] Scheduled: sync(3m), push(10m), tech-events(30s)');
  } else {
    console.log('[CRON] Disabled (set CRON_ENABLED=true)');
  }

  /**
   * HTTP SERVER (NO url.parse)
   */
  const server = createServer((req, res) => {
    let protocol = 'http://';
    if (
      req.headers.host?.startsWith('https://') ||
      process.env.NODE_ENV === 'production'
    ) {
      protocol = 'https://';
    }
    const parsedUrl = new URL(req.url || '/', `${protocol}${req.headers.host}`);

    // Next.js expects a URL object with specific properties, but we can pass
    // the parsed URL directly since handle() only uses pathname and query
    handle(req, res, parsedUrl as any);
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
