import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export async function GET() {
  const start = Date.now();

  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3307,
      user: 'dompis_user',
      password: 'dompis_password',
      database: 'dompis_db',
      connectTimeout: 5000,
    });

    const [rows] = await connection.query('SELECT 1 as test');
    await connection.end();

    return NextResponse.json({
      status: 'ok',
      mysql: 'connected',
      queryTime: `${Date.now() - start}ms`,
      result: rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        mysql: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        queryTime: `${Date.now() - start}ms`,
      },
      { status: 500 },
    );
  }
}
