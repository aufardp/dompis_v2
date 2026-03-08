import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
};

function getAdapter() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL missing');

  const u = new URL(url);

  const database = u.pathname.replace(/^\//, '');

  const connectionLimit = Number(u.searchParams.get('connection_limit')) || 25;

  return new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    connectionLimit,
    connectTimeout: 15000,
  });
}

function createPrisma() {
  const adapter = getAdapter();

  const client = new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

  client.$on('error', (e) => {
    console.error('[Prisma] Error:', e.message);
  });

  client.$on('warn', (e) => {
    console.warn('[Prisma] Warning:', e.message);
  });

  return client;
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
  }

  return globalForPrisma.prisma;
}

const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrisma();

    return (client as any)[prop];
  },
});

export default prisma;
