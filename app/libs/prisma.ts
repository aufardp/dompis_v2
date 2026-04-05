import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaMariaDb | undefined;
};

const adapter =
  globalForPrisma.adapter ??
  new PrismaMariaDb(process.env.DATABASE_URL!);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.adapter = adapter;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

// Prevent multiple instances in development (Next.js hot reload)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Optional: connect early (good for Docker / production stability)
export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// Default export for backward compatibility with `import prisma from ...`
export default prisma;
