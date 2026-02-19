export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

export async function GET() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT), // 🔥 tambahkan ini
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, // 🔥 ini yang benar
      database: process.env.DB_NAME,
    });

    await connection.ping(); // test koneksi dulu

    const [users]: any = await connection.execute(
      'SELECT id_user, nik FROM users',
    );

    for (const user of users) {
      const hashed = await bcrypt.hash(user.nik, 10);

      await connection.execute(
        'UPDATE users SET password = ? WHERE id_user = ?',
        [hashed, user.id_user],
      );
    }

    await connection.end();

    return NextResponse.json({
      success: true,
      message: 'Password berhasil di-hash bcrypt',
    });
  } catch (error: any) {
    console.error('ERROR ASLI:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
