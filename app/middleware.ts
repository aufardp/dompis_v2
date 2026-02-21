import { NextResponse } from 'next/server';
import { verifyAccessToken, AccessTokenPayload } from '@/app/libs/auth';
import { AttendanceService } from '@/app/libs/services/attendance.service';

export function middleware(req: any) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith('/api');
  const isProtectedPage =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/teknisi') ||
    pathname.startsWith('/helpdesk');

  if (!isApi && !isProtectedPage) {
    return NextResponse.next();
  }

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

  if (!token) return respondUnauthorized();

  let decoded: AccessTokenPayload;

  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    return respondUnauthorized();
  }

  if (decoded.role === 'teknisi') {
    const isAttendancePage = pathname.startsWith('/teknisi/attendance');

    const today = AttendanceService.getTodayDateString();

    const hasAttendanceField =
      typeof decoded.attendance_checked_in === 'boolean';
    const isSameDay = decoded.attendance_date === today;
    const hasCheckedInToday =
      hasAttendanceField && decoded.attendance_checked_in && isSameDay;

    if (!hasCheckedInToday) {
      if (!isAttendancePage) {
        const url = req.nextUrl.clone();
        url.pathname = '/teknisi/attendance';
        return NextResponse.redirect(url);
      }
    } else {
      if (isAttendancePage) {
        const url = req.nextUrl.clone();
        url.pathname = '/teknisi';
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/teknisi/:path*',
    '/helpdesk/:path*',
  ],
};
