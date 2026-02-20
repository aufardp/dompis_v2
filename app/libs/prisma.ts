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

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url;
}

function getAdapter() {
  const databaseUrl = getDatabaseUrl();

  const u = new URL(databaseUrl);
  const database = u.pathname.replace(/^\//, '');

  return new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: getAdapter() });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
