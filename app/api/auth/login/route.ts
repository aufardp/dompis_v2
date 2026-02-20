import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken } from '@/app/libs/auth';

export async function POST(req: Request) {
  const { username, password } = await req.json();

  const user = await prisma.users.findFirst({
    where: { username },
    include: { roles: { select: { key: true } } },
  });

  if (!user)
    return NextResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 },
    );

  const valid = await bcrypt.compare(password, user.password || '');

  if (!valid)
    return NextResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 },
    );

  const role = user.roles?.key || '';

  const payload = {
    id_user: user.id_user,
    role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const response = NextResponse.json({
    success: true,
    accessToken,
    role,
  });

  response.cookies.set({
    name: 'token',
    value: accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });

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
