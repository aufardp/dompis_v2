import { createServer } from 'http';
import { parse as parseUrl } from 'url';
import next from 'next';
import { logger } from '@/lib/observability/logger';

logger.info('[boot] 1. Loading dotenv...');
import 'dotenv/config';

logger.info('[boot] 2. Loading Prisma...');
import { prisma } from '@/app/libs/prisma';

logger.info('[boot] 3. Loading Redis...');
import { closeRedis } from '@/lib/redis';

logger.info('[boot] 4. Loading SSE...');
import { initSSERedis, closeSSERedis } from '@/app/libs/sseBroadcast';

logger.info('[boot] 5. Loading DB Health Check...');
import { startDatabaseHealthCheck, stopDatabaseHealthCheck } from '@/app/libs/dbHealthCheck';

logger.info('[boot] All modules loaded successfully.');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

let httpServer: ReturnType<typeof createServer>;

async function shutdown(signal: string) {
  logger.info(`[Server] Received ${signal} — shutting down...`);

  const shutdownTimeout = setTimeout(() => {
    logger.warn('[Server] Force close (timeout)');
    process.exit(1);
  }, 10_000);
  shutdownTimeout.unref();

  try {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    logger.info('[Server] HTTP server closed');
  } catch (err) {
    logger.error('[Server] HTTP close error:', { error: String(err) });
  }

  await Promise.allSettled([
    stopDatabaseHealthCheck(),
    closeSSERedis(),
    prisma.$disconnect().then(() => logger.info('[Server] Prisma disconnected')),
    closeRedis().then(() => logger.info('[Server] Redis disconnected')),
  ]);
  clearTimeout(shutdownTimeout);
  logger.info('[Server] Shutdown complete');
}

// Jaring pengaman: sebuah promise rejection yang tidak tertangani (mis. query
// analitik dashboard yang gagal karena DB overload) TIDAK boleh menjatuhkan
// proses web. Cukup dicatat — request individual sudah punya try/catch masing2.
process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled promise rejection (diabaikan):', {
    error: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
    component: 'server',
  });
});
process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught exception (diabaikan):', {
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    component: 'server',
  });
});

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startServer() {
  await app.prepare();
  logger.info('[Next.js] App prepared');

  if (dev) {
    logger.info('[Dev] Starting with custom server — HMR enabled');
    httpServer = createServer((req, res) => {
      const url = parseUrl(req.url || '/', true);
      handle(req, res, url);
    });

    httpServer.listen(port, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
    });

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGUSR2', () => void shutdown('SIGUSR2'));
  } else {
    await initSSERedis();
    logger.info('[SSE] Redis subscriber initialized');

    // Start DB health check in production
    startDatabaseHealthCheck(30000);
    logger.info('[DB] Health check started');

    httpServer = createServer((req, res) => {
      const url = parseUrl(req.url || '/', true);
      handle(req, res, url);
    });

    httpServer.listen(port, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
    });

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGUSR2', () => void shutdown('SIGUSR2'));
  }
}

startServer().catch((err) => {
  logger.error('Failed to start server:', { error: String(err), component: 'server' });
  process.exit(1);
});