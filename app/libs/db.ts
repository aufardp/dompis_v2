import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || '',

      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
    });
  }

  return pool;
}

export default getPool;

/**
 * Convert undefined values to null
 * mysql2 does not accept undefined
 */
function sanitizeParams(
  params?: (string | number | boolean | Date | null | undefined)[],
): (string | number | boolean | Date | null)[] | undefined {
  if (!params) return undefined;

  return params.map((p) => (p === undefined ? null : p));
}

/**
 * Generic query helper
 */
export async function query<T>(
  sql: string,
  params?: (string | number | boolean | Date | null | undefined)[],
): Promise<T> {
  const pool = getPool();

  const safeParams = sanitizeParams(params);

  const [rows] = await pool.execute(sql, safeParams);

  return rows as T;
}

/**
 * User type
 */
type UserRow = {
  id_user: number;
  username: string;
  password: string | null;
  role_id: number;
  role_key: string | null;
};

/**
 * Find user by username
 */
export async function findUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const sql = `
    SELECT u.*, r.key as role_key
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id_role
    WHERE u.username = ?
    LIMIT 1
  `;

  const rows = await query<UserRow[]>(sql, [username]);

  return rows[0] ?? null;
}

/**
 * Get service areas assigned to user
 */
export async function findUserWorkzones(userId: number): Promise<string[]> {
  const sql = `
    SELECT sa.nama_sa
    FROM user_sa us
    JOIN service_area sa ON us.sa_id = sa.id_sa
    WHERE us.user_id = ?
  `;

  const rows = await query<{ nama_sa: string }[]>(sql, [userId]);

  return rows.map((r) => r.nama_sa);
}

/**
 * Close pool (useful for tests or graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
