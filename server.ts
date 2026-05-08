import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

console.log('[boot] 1. Loading dotenv...');
import 'dotenv/config';

console.log('[boot] 2. Loading Prisma...');
import { prisma } from '@/app/libs/prisma';

console.log('[boot] 3. Loading Redis...');
import { closeRedis } from '@/lib/redis';

console.log('[boot] 4. Loading SSE...');
import { initSSERedis, closeSSERedis } from '@/app/libs/sseBroadcast';

console.log('[boot] All modules loaded successfully.');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startServer() {
  await app.prepare();
  console.log('[Next.js] App prepared');

  await initSSERedis();
  console.log('[SSE] Redis subscriber initialized');

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal} — shutting down...`);

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

    await Promise.allSettled([
      closeSSERedis(),
      prisma.$disconnect().then(() => console.log('[Server] Prisma disconnected')),
      closeRedis().then(() => console.log('[Server] Redis disconnected')),
    ]);

    console.log('[Server] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGUSR2', () => void shutdown('SIGUSR2'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});