import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/observability/logger';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaBulk?: PrismaClient;
};

const connectionLimit = parseInt(process.env.PRISMA_CONNECTION_LIMIT || '20', 10);
const poolTimeoutSeconds = parseInt(process.env.PRISMA_POOL_TIMEOUT || '30', 10);
const socketTimeoutSeconds = parseInt(
  process.env.PRISMA_SOCKET_TIMEOUT || '60',
  10,
);
const socketTimeoutBulkSeconds = parseInt(
  process.env.PRISMA_SOCKET_TIMEOUT_BULK || '60',
  10,
);
const slowQueryThresholdMs = Number(process.env.PRISMA_SLOW_QUERY_MS || '0');
const enableSlowQueryLogging =
  Number.isFinite(slowQueryThresholdMs) && slowQueryThresholdMs > 0;

const prismaLogConfig: any =
  process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : enableSlowQueryLogging
      ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'error' }]
      : ['error'];

const dbUrl = process.env.DATABASE_URL
  ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=${connectionLimit}&pool_timeout=${poolTimeoutSeconds}&connect_timeout=15&socket_timeout=${socketTimeoutSeconds}`
  : undefined;

const dbUrlBulk = process.env.DATABASE_URL
  ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=${connectionLimit}&pool_timeout=${poolTimeoutSeconds}&connect_timeout=15&socket_timeout=${socketTimeoutBulkSeconds}`
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogConfig,
    datasources: dbUrl
      ? {
          db: { url: dbUrl },
        }
      : undefined,
  });

export const prismaBulk =
  globalForPrisma.prismaBulk ??
  new PrismaClient({
    log: prismaLogConfig,
    datasources: dbUrlBulk
      ? {
          db: { url: dbUrlBulk },
        }
      : undefined,
  });

if (enableSlowQueryLogging) {
  (prisma as any).$on('query', (event: any) => {
    if (event.duration < slowQueryThresholdMs) return;

    const statement = event.query.replace(/\s+/g, ' ').trim();
    logger.warn('Slow Prisma query detected', {
      component: 'prisma',
      durationMs: event.duration,
      target: event.target,
      statement:
        statement.length > 400 ? `${statement.slice(0, 397)}...` : statement,
    });
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaBulk = prismaBulk;
}

export async function connectDB() {
  const retryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30000);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.$connect();
      await prismaBulk.$connect();
      logger.info('✅ Database connected');
      return;
    } catch (error) {
      logger.error('❌ Database connection failed:', { attempt: attempt + 1, totalAttempts: 5, error: (error as Error)?.message });
      if (attempt < 4) {
        await new Promise(r => setTimeout(r, retryDelay(attempt)));
      }
    }
  }
  logger.error('❌ All database connection attempts exhausted');
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
}

export default prisma;
