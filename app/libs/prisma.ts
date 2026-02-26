/**
 * Prisma Client Configuration (Production Safe)
 */

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
};

function getAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const u = new URL(url);
  const database = u.pathname.replace(/^\//, '');
  const connectionLimit = Number(u.searchParams.get('connection_limit')) || 5;

  return new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    connectionLimit,
    connectTimeout: 10000,
    idleTimeout: 60000, // ✅ 60 detik (jangan 5000)
  });
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: getAdapter(),
    log: ['error'],
  });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
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
