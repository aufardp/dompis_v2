/**
 * Prisma Client Configuration
 *
 * TIMEZONE HANDLING:
 * - All dates are stored in UTC in the database
 * - Set TZ=UTC in .env to ensure Node.js uses UTC
 * - Use app/utils/datetime.ts for date conversions:
 *   - formatDateWIB() - Convert UTC to WIB for display
 *   - toISODateString() - Safe ISO serialization
 * - MySQL TIMESTAMP fields auto-convert based on session timezone
 * - With TZ=UTC, all operations are consistent
 */

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma/client';

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
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({ adapter: getAdapter() });
}

export const prisma = globalForPrisma.prisma;
export default prisma;
