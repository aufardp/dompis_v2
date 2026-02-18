import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/app/libs/auth';

export function middleware(req: any) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith('/api');
  const isProtectedPage =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/teknisi') ||
    pathname.startsWith('/helpdesk');

  // Only protect API + protected app routes
  if (!isApi && !isProtectedPage) {
    return NextResponse.next();
  }

  // ✅ Skip endpoint auth
  if (
    isApi &&
    (pathname.startsWith('/api/auth/login') ||
      pathname.startsWith('/api/auth/refresh'))
  ) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.get('token')?.value;

  const respondUnauthorized = () => {
    if (isApi) {
      const response = NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 },
      );
      response.cookies.set({
        name: 'token',
        value: '',
        httpOnly: true,
        path: '/',
        maxAge: 0,
      });
      response.cookies.set({
        name: 'refreshToken',
        value: '',
        httpOnly: true,
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    const url = req.nextUrl.clone();
    url.pathname = '/login';

    const response = NextResponse.redirect(url);
    response.cookies.set({
      name: 'token',
      value: '',
      httpOnly: true,
      path: '/',
      maxAge: 0,
    });
    response.cookies.set({
      name: 'refreshToken',
      value: '',
      httpOnly: true,
      path: '/',
      maxAge: 0,
    });
    return response;
  };

  // No token
  if (!token) return respondUnauthorized();

  try {
    // 🔐 Akan throw error jika expired / invalid
    verifyAccessToken(token);

    return NextResponse.next();
  } catch (error) {
    return respondUnauthorized();
  }
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/teknisi/:path*',
    '/helpdesk/:path*',
  ],
};
