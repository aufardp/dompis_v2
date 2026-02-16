import { NextResponse } from 'next/server';
import db from '@/app/libs/db';
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken } from '@/app/libs/auth';

export async function POST(req: Request) {
  const { username, password } = await req.json();

  const [rows]: any = await db.query(
    `SELECT u.id_user, u.password, r.key as role
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id_role
     WHERE u.username = ?
     LIMIT 1`,
    [username],
  );

  if (!rows.length)
    return NextResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 },
    );

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password);

  if (!valid)
    return NextResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 },
    );

  const payload = {
    id_user: user.id_user,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const response = NextResponse.json({
    success: true,
    accessToken,
    role: user.role,
  });

  // Set access token cookie for API protection
  response.cookies.set({
    name: 'token',
    value: accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 hour
    path: '/',
  });

  // Set refresh token cookie
  response.cookies.set({
    name: 'refreshToken',
    value: refreshToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
