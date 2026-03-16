import mysql, { Pool, PoolOptions } from 'mysql2/promise';

/**
 * Legacy raw SQL pool for backward compatibility.
 * This pool is kept separate from Prisma for specific raw SQL queries.
 * Uses individual env vars instead of DATABASE_URL.
 */
const poolConfig: PoolOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dompis_db',
  connectionLimit: 5,
  connectTimeout: 15000,
  keepAliveInitialDelay: 30000,
  enableKeepAlive: true,
};

const pool: Pool = mysql.createPool(poolConfig);

(
  pool as unknown as {
    on: (event: string, handler: (err: Error) => void) => void;
  }
).on('error', (err: Error) => console.error('[mysql2 pool]', err.message));

export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
