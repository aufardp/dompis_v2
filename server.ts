import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import 'dotenv/config';
import cron from 'node-cron';
import prisma from '@/app/libs/prisma';

import { syncSpreadsheet } from '@/lib/google-sheets/sync';
import { pushSpreadsheet } from '@/lib/google-sheets/push';
import { dispatchTechEvents } from '@/app/libs/integrations/dispatchTechEvents';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * DB LOCK WRAPPER
 * Mencegah cron double jalan
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
  await app.prepare();
  console.log('Next.js app prepared');

  const cronEnabled = process.env.CRON_ENABLED === 'true';

  if (cronEnabled) {
    /**
     * SYNC — setiap 5 menit
     */
    cron.schedule('*/5 * * * *', async () => {
      console.log('[CRON] Running sync...');

      await withDbLock('sync_lock', async () => {
        try {
          const result = await withTimeout(syncSpreadsheet(), 5 * 60 * 1000);
          console.log('[CRON] Sync result:', result);
        } catch (error) {
          console.error('[CRON] Sync error:', error);
        }
      });
    });

    /**
     * PUSH — setiap 10 menit
     */
    cron.schedule('*/10 * * * *', async () => {
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
     * TECH EVENTS — setiap 1 menit
     */
    cron.schedule('* * * * *', async () => {
      console.log('[CRON] Running tech events dispatch...');

      await withDbLock('tech_events_lock', async () => {
        try {
          const result = await withTimeout(dispatchTechEvents(), 60 * 1000);
          console.log('[CRON] Tech events result:', result);
        } catch (error) {
          console.error('[CRON] Tech events error:', error);
        }
      });
    });

    console.log('[CRON] Scheduled: sync(5m), push(10m), tech-events(1m)');
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
   * Graceful shutdown
   */
  const shutdown = async () => {
    console.log('Shutting down server...');

    server.close(async () => {
      await prisma.$disconnect();
      console.log('Server closed gracefully');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
