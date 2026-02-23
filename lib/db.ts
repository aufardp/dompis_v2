import mysql, {
  Pool,
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
} from 'mysql2/promise';
import 'dotenv/config';

function getPoolConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }

  const [, user, password, host, port, database] = match;

  return {
    host,
    port: parseInt(port, 10),
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

const pool: Pool = mysql.createPool(getPoolConfig());

export type { Pool, PoolConnection, RowDataPacket, ResultSetHeader };
export default pool;
