import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  adapter?: PrismaMariaDb;
};

// ❗ DETECT BUILD PHASE
const isBuild = process.env.PRISMA_GENERATE === 'true';

let prisma: PrismaClient;

if (isBuild) {
  // 🔥 saat build → JANGAN pakai adapter
  prisma = new PrismaClient();
} else {
  const adapter =
    globalForPrisma.adapter ?? new PrismaMariaDb(process.env.DATABASE_URL!);

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.adapter = adapter;
  }

  const options: any = {
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  };

  options.adapter = adapter;

  prisma = globalForPrisma.prisma ?? new PrismaClient(options);

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }
}

export { prisma };
export default prisma;
