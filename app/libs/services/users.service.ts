import db from '@/app/libs/db';
import bcrypt from 'bcryptjs';
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

type DbValue = string | number | boolean | Date | null;

/* =========================
   TYPES
========================= */

export interface CreateUserDTO {
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  password: string;
  role_id: number;
  area_id: number;
  sa_ids?: number[]; // many-to-many
  sa_id?: number; // backward-compat (single)
}

export interface UpdateUserDTO {
  nik?: string;
  nama?: string;
  jabatan?: string;
  username?: string;
  password?: string;
  role_id?: number;
  area_id?: number;
  sa_ids?: number[];
  sa_id?: number; // backward-compat (single)
}

export interface CurrentUser {
  id_user: number;
  nama: string;
  jabatan: string;
  role_name: string;
}

interface UserListRow extends RowDataPacket {
  id_user: number;
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  role_id: number;
  area_id: number;
  created_at: Date;
  updated_at: Date;
}

interface UserRow extends RowDataPacket {
  id_user: number;
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  password: string;
  role_id: number;
  area_id: number;
  created_at: Date;
  updated_at: Date;
}

interface UserByIdRow extends UserRow {
  sa_ids: string | null;
}

export interface UserById extends UserRow {
  sa_ids: number[];
}

interface IdRow extends RowDataPacket {
  id_user: number;
}

interface BasicUserRow extends RowDataPacket {
  id_user: number;
  nama: string;
  nik: string;
}

function ensureConnectionRelease(connection: PoolConnection) {
  try {
    connection.release();
  } catch {
    // ignore
  }
}

/* =========================
   GET ALL USERS
========================= */

export async function getAllUsers(filters?: {
  role_id?: number;
  search?: string;
}) {
  let query = `
    SELECT 
      u.id_user,
      u.nik,
      u.nama,
      u.jabatan,
      u.username,
      u.role_id,
      u.area_id,
      u.created_at,
      u.updated_at
    FROM users u
    WHERE 1=1
  `;

  const params: DbValue[] = [];

  if (filters?.role_id) {
    query += ' AND u.role_id = ?';
    params.push(filters.role_id);
  }

  if (filters?.search) {
    query += ' AND (u.nama LIKE ? OR u.nik LIKE ? OR u.username LIKE ?)';
    const search = `%${filters.search}%`;
    params.push(search, search, search);
  }

  query += ' ORDER BY u.id_user DESC';

  const [rows] = await db.query<UserListRow[]>(query, params);
  return rows;
}

/* =========================
   GET USER BY ID
========================= */

export async function getUserById(id: number) {
  const [rows] = await db.query<UserByIdRow[]>(
    `
    SELECT 
      u.*,
      GROUP_CONCAT(us.sa_id) as sa_ids
    FROM users u
    LEFT JOIN user_sa us ON u.id_user = us.user_id
    WHERE u.id_user = ?
    GROUP BY u.id_user
    `,
    [id],
  );

  const row = rows[0];
  if (!row) return null;

  const rawSa = row.sa_ids;
  const sa_ids = rawSa
    ? rawSa
        .split(',')
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
    : [];

  const { sa_ids: _ignored, ...rest } = row;
  return { ...rest, sa_ids };
}

export async function getCurrentUser(
  id_user: number,
): Promise<CurrentUser | null> {
  const [rows] = await db.query<
    (RowDataPacket & {
      id_user: number;
      nama: string;
      jabatan: string;
      role_name: string;
    })[]
  >(
    `
    SELECT
      u.id_user,
      u.nama,
      u.jabatan,
      COALESCE(r.name, '') AS role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id_role
    WHERE u.id_user = ?
    LIMIT 1
    `,
    [id_user],
  );

  return rows[0] || null;
}

export async function getUsersByRoleId(roleId: number, search?: string) {
  let sql = `
    SELECT u.id_user, u.nama, u.nik
    FROM users u
    WHERE u.role_id = ?
  `;

  const params: DbValue[] = [roleId];

  if (search) {
    sql += ' AND (u.nama LIKE ? OR u.nik LIKE ?)';
    const keyword = `%${search}%`;
    params.push(keyword, keyword);
  }

  sql += ' ORDER BY u.nama ASC';
  const [rows] = await db.query<BasicUserRow[]>(sql, params);
  return rows;
}

export async function getUsersByAreaId(areaId: number, search?: string) {
  let sql = `
    SELECT u.id_user, u.nama, u.nik
    FROM users u
    WHERE u.area_id = ?
  `;

  const params: DbValue[] = [areaId];

  if (search) {
    sql += ' AND (u.nama LIKE ? OR u.nik LIKE ?)';
    const keyword = `%${search}%`;
    params.push(keyword, keyword);
  }

  sql += ' ORDER BY u.nama ASC';
  const [rows] = await db.query<BasicUserRow[]>(sql, params);
  return rows;
}

export async function getUsersBySaId(saId: number, search?: string) {
  let sql = `
    SELECT u.id_user, u.nama, u.nik
    FROM users u
    INNER JOIN user_sa us ON us.user_id = u.id_user
    WHERE us.sa_id = ?
  `;

  const params: DbValue[] = [saId];

  if (search) {
    sql += ' AND (u.nama LIKE ? OR u.nik LIKE ?)';
    const keyword = `%${search}%`;
    params.push(keyword, keyword);
  }

  sql += ' ORDER BY u.nama ASC';
  const [rows] = await db.query<BasicUserRow[]>(sql, params);
  return rows;
}

/* =========================
   CREATE USER (TRANSACTION SAFE)
========================= */

export async function createUser(data: CreateUserDTO) {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Check duplicate
    const [existing] = await connection.query<IdRow[]>(
      'SELECT id_user FROM users WHERE username = ? OR nik = ?',
      [data.username, data.nik],
    );

    if (existing.length > 0) {
      throw new Error('Username atau NIK sudah terdaftar');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const [result] = await connection.query<ResultSetHeader>(
      `
      INSERT INTO users
      (nik, nama, jabatan, username, password, role_id, area_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        data.nik,
        data.nama,
        data.jabatan,
        data.username,
        hashedPassword,
        data.role_id,
        data.area_id,
      ],
    );

    const userId = result.insertId;

    // Insert pivot SA
    const saIds = Array.isArray(data.sa_ids)
      ? data.sa_ids
      : Number.isFinite(data.sa_id)
        ? [data.sa_id]
        : [];

    if (saIds.length > 0) {
      for (const saId of saIds) {
        await connection.query(
          `
          INSERT INTO user_sa (user_id, sa_id, created_at, updated_at)
          VALUES (?, ?, NOW(), NOW())
          `,
          [userId, saId],
        );
      }
    }

    await connection.commit();
    ensureConnectionRelease(connection);

    return userId;
  } catch (error) {
    await connection.rollback();
    ensureConnectionRelease(connection);
    throw error;
  }
}

/* =========================
   UPDATE USER
========================= */

export async function updateUser(id: number, data: UpdateUserDTO) {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const existing = await getUserById(id);
    if (!existing) {
      throw new Error('User tidak ditemukan');
    }

    // Check duplicate username
    if (data.username && data.username !== existing.username) {
      const [dup] = await connection.query<IdRow[]>(
        'SELECT id_user FROM users WHERE username = ? AND id_user != ?',
        [data.username, id],
      );
      if (dup.length > 0) {
        throw new Error('Username sudah digunakan');
      }
    }

    // Check duplicate nik
    if (data.nik && data.nik !== existing.nik) {
      const [dup] = await connection.query<IdRow[]>(
        'SELECT id_user FROM users WHERE nik = ? AND id_user != ?',
        [data.nik, id],
      );
      if (dup.length > 0) {
        throw new Error('NIK sudah digunakan');
      }
    }

    const fields: string[] = [];
    const values: DbValue[] = [];

    const addField = (field: string, value: DbValue) => {
      fields.push(`${field} = ?`);
      values.push(value);
    };

    if (data.nik !== undefined) addField('nik', data.nik);
    if (data.nama !== undefined) addField('nama', data.nama);
    if (data.jabatan !== undefined) addField('jabatan', data.jabatan);
    if (data.username !== undefined) addField('username', data.username);
    if (data.role_id !== undefined) addField('role_id', data.role_id);
    if (data.area_id !== undefined) addField('area_id', data.area_id);

    if (data.password !== undefined) {
      const hashed = await bcrypt.hash(data.password, 10);
      addField('password', hashed);
    }

    if (fields.length > 0) {
      addField('updated_at', new Date());
      values.push(id);

      await connection.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id_user = ?`,
        values,
      );
    }

    // Update SA pivot
    if (data.sa_ids !== undefined || data.sa_id !== undefined) {
      await connection.query('DELETE FROM user_sa WHERE user_id = ?', [id]);

      const saIds = Array.isArray(data.sa_ids)
        ? data.sa_ids
        : Number.isFinite(data.sa_id)
          ? [data.sa_id]
          : [];

      if (saIds.length > 0) {
        for (const saId of saIds) {
          await connection.query(
            `
            INSERT INTO user_sa (user_id, sa_id, created_at, updated_at)
            VALUES (?, ?, NOW(), NOW())
            `,
            [id, saId],
          );
        }
      }
    }

    await connection.commit();
    ensureConnectionRelease(connection);

    return true;
  } catch (error) {
    await connection.rollback();
    ensureConnectionRelease(connection);
    throw error;
  }
}

/* =========================
   DELETE USER
========================= */

export async function deleteUser(id: number) {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const existing = await getUserById(id);
    if (!existing) {
      throw new Error('User tidak ditemukan');
    }

    await connection.query('DELETE FROM user_sa WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM users WHERE id_user = ?', [id]);

    await connection.commit();
    ensureConnectionRelease(connection);

    return true;
  } catch (error) {
    await connection.rollback();
    ensureConnectionRelease(connection);
    throw error;
  }
}

/* =========================
   CHANGE PASSWORD
========================= */

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
) {
  const user = await getUserById(userId);
  if (!user) throw new Error('User tidak ditemukan');

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new Error('Password saat ini salah');

  const hashed = await bcrypt.hash(newPassword, 10);

  await db.query(
    'UPDATE users SET password = ?, updated_at = NOW() WHERE id_user = ?',
    [hashed, userId],
  );

  return true;
}
