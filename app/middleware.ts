import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/app/libs/auth';

export function middleware(req: any) {
  const { pathname } = req.nextUrl;

  // ✅ Hanya proteksi API
  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // ✅ Skip endpoint auth
  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/refresh')
  ) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.get('token')?.value;

  // 🔴 Jika tidak ada token
  if (!token) {
    const response = NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );

    response.cookies.delete('token');

    return response;
  }

  try {
    // 🔐 Akan throw error jika expired / invalid
    verifyAccessToken(token);

    return NextResponse.next();
  } catch (error) {
    // 🔴 Token expired / invalid
    const response = NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );

    // ✅ Auto clear cookie
    response.cookies.set({
      name: 'token',
      value: '',
      httpOnly: true,
      path: '/',
      maxAge: 0, // expire immediately
    });

    return response;
  }
}

export const config = {
  matcher: ['/api/:path*'],
};
