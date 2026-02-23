import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: '127.0.0.1',
      port: 3307,
      user: 'dompis_user',
      password: 'dompis_password',
      database: 'dompis_db',
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

export async function findUserByUsername(username: string) {
  const sql = `
    SELECT u.*, r.key as role_key
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id_role
    WHERE u.username = ?
    LIMIT 1
  `;
  return query<any[]>(sql, [username]).then((rows) => rows[0] || null);
}

export async function findUserWorkzones(userId: number) {
  const sql = `
    SELECT sa.nama_sa
    FROM user_sa us
    JOIN service_area sa ON us.sa_id = sa.id_sa
    WHERE us.user_id = ?
  `;
  const rows = await query<{ nama_sa: string }[]>(sql, [userId]);
  return rows.map((r) => r.nama_sa);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
