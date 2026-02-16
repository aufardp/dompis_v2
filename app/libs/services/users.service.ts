import db from '@/app/libs/db';
import bcrypt from 'bcryptjs';

export interface User {
  id: number;
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  password: string;
  id_role: number;
  id_area: number;
  id_sa: number;
  created_at: Date;
  updated_at: Date;
}

export async function getAllUsers(filters?: {
  role_id?: string;
  search?: string;
}) {
  let query =
    'SELECT id_user, nik, nama, jabatan, username, role_id, area_id, created_at, updated_at FROM users WHERE 1=1';
  const params: any[] = [];

  if (filters?.role_id) {
    query += ' AND role_id = ?';
    params.push(filters.role_id);
  }

  if (filters?.search) {
    query += ' AND (nama LIKE ? OR nik LIKE ? OR username LIKE ?)';
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY id_user DESC';

  const [rows]: any = await db.query(query, params);
  return rows;
}

export async function getUserById(id: number) {
  const [rows]: any = await db.query(
    'SELECT * FROM users WHERE id_user = ?', // ← Use your actual primary key
    [id],
  );
  return rows[0];
}

export async function getUsersByRoleId(roleId: number) {
  const [rows]: any = await db.query(`SELECT * FROM users WHERE role_id = ?`, [
    roleId,
  ]);

  return rows;
}

export async function createUser(data: {
  nik: string;
  nama: string;
  jabatan: string;
  username: string;
  password: string;
  role_id: number;
  area_id: number;
  sa_id: number;
}) {
  const [existing]: any = await db.query(
    'SELECT id_user FROM users WHERE username = ? OR nik = ?',
    [data.username, data.nik],
  );

  if (existing.length > 0) {
    throw new Error('Username atau NIK sudah terdaftar');
  }

  const [area]: any = await db.query(
    'SELECT id_area FROM area WHERE id_area = ?',
    [data.area_id],
  );

  if (area.length === 0) {
    throw new Error('Area tidak ditemukan');
  }

  const [sa]: any = await db.query(
    'SELECT id_sa FROM service_area WHERE id_sa = ?',
    [data.sa_id],
  );

  if (sa.length === 0) {
    throw new Error('Service Area tidak ditemukan');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const [result]: any = await db.query(
    `INSERT INTO users (nik, nama, jabatan, username, password, role_id, area_id, sa_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      data.nik,
      data.nama,
      data.jabatan,
      data.username,
      hashedPassword,
      data.role_id,
      data.area_id,
      data.sa_id,
    ],
  );

  return result.insertId;
}

export async function updateUser(
  id: number,
  data: {
    nik?: string;
    nama?: string;
    jabatan?: string;
    username?: string;
    password?: string;
    role_id?: number;
    area_id?: number;
    sa_id?: number;
  },
) {
  // Check if user exists
  const existing = await getUserById(id);
  if (!existing) {
    throw new Error('User tidak ditemukan');
  }

  // Check username duplication - FIXED
  if (data.username && data.username !== existing.username) {
    const [duplicate]: any = await db.query(
      'SELECT * FROM users WHERE username = ? AND id_user != ?',
      [data.username, id],
    );
    if (duplicate.length > 0) {
      throw new Error('Username sudah digunakan');
    }
  }

  // Check NIK duplication - FIXED
  if (data.nik && data.nik !== existing.nik) {
    const [duplicate]: any = await db.query(
      'SELECT * FROM users WHERE nik = ? AND id_user != ?',
      //       ^^^^^^^ Changed from 'id' to 'id_user'
      [data.nik, id],
    );
    if (duplicate.length > 0) {
      throw new Error('NIK sudah digunakan');
    }
  }

  // Validate foreign keys if provided
  if (data.area_id) {
    const [area]: any = await db.query(
      'SELECT id_area FROM area WHERE id_area = ?',
      [data.area_id],
    );
    if (area.length === 0) {
      throw new Error('Area tidak ditemukan');
    }
  }

  if (data.sa_id) {
    const [sa]: any = await db.query(
      'SELECT id_sa FROM service_area WHERE id_sa = ?',
      [data.sa_id],
    );
    if (sa.length === 0) {
      throw new Error('Service Area tidak ditemukan');
    }
  }

  // Build dynamic update query
  const updates: { fields: string[]; values: any[] } = {
    fields: [],
    values: [],
  };

  const addField = (field: string, value: any) => {
    updates.fields.push(`${field} = ?`);
    updates.values.push(value);
  };

  if (data.nik !== undefined) addField('nik', data.nik);
  if (data.nama !== undefined) addField('nama', data.nama);
  if (data.jabatan !== undefined) addField('jabatan', data.jabatan);
  if (data.username !== undefined) addField('username', data.username);
  if (data.role_id !== undefined) addField('role_id', data.role_id);
  if (data.area_id !== undefined) addField('area_id', data.area_id);
  if (data.sa_id !== undefined) addField('sa_id', data.sa_id);

  // Hash password if provided
  if (data.password !== undefined) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    addField('password', hashedPassword);
  }

  if (updates.fields.length === 0) {
    throw new Error('Tidak ada data untuk diupdate');
  }

  // Add updated_at and id
  addField('updated_at', new Date());
  updates.values.push(id);

  await db.query(
    `UPDATE users SET ${updates.fields.join(', ')} WHERE id_user = ?`,
    updates.values,
  );

  return true;
}

export async function deleteUser(id: string) {
  const existing = await getUserById(Number(id));

  if (!existing) {
    throw new Error('User tidak ditemukan');
  }

  await db.query('DELETE FROM users WHERE id = ?', [id]);
}
