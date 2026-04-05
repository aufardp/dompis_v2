import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  adapter?: PrismaMariaDb;
};

// Init adapter (singleton)
const adapter =
  globalForPrisma.adapter ?? new PrismaMariaDb(process.env.DATABASE_URL!);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.adapter = adapter;
}

// 👉 FIX: use options object with type escape
const prismaOptions: any = {
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
};

// inject adapter safely
if (adapter) {
  prismaOptions.adapter = adapter;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

// prevent multiple instances (Next.js dev)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Optional: connect early (recommended for Docker)
export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

export default prisma;
