import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development' &&
      process.env.PRISMA_DEBUG === 'false'
        ? ['query', 'info', 'error', 'warn']
        : ['error', 'warn'],
  });
}

if (process.env.NODE_ENV === 'production') {
  if (process.env.DEBUG?.includes('prisma')) {
    delete process.env.DEBUG;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

prisma.$on('error' as never, (e: { message: string }) => {
  console.error('[Prisma] Error:', e.message);
});

prisma.$on('warn' as never, (e: { message: string }) => {
  console.warn('[Prisma] Warning:', e.message);
});

export async function connectWithRetry(): Promise<void> {
  const maxAttempts = 5;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Prisma] Connecting... attempt ${attempt}/${maxAttempts}`);
    try {
      await prisma.$connect();
      console.log('[Prisma] Connected to database');
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error('[Prisma] Connection failed after all attempts:', err);
        throw err;
      }
      console.warn(
        `[Prisma] Connection attempt ${attempt} failed, retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export default prisma;
