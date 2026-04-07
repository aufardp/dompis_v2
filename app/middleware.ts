import { NextResponse, NextRequest } from 'next/server';
import { verifyAccessToken, AccessTokenPayload } from '@/app/libs/auth';
import { AttendanceService } from '@/app/libs/services/attendance.service';

// ─── Helper: build a clean redirect URL ────────────────────────────
function buildRedirectUrl(req: NextRequest, pathname: string): URL {
  return new URL(pathname, req.nextUrl.origin);
}

// ─── Helper: respond unauthorized (clear cookies + redirect/reject) ─
function respondUnauthorized(req: NextRequest): NextResponse {
  const isApi = req.nextUrl.pathname.startsWith('/api');

  const response = isApi
    ? NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 },
      )
    : NextResponse.redirect(buildRedirectUrl(req, '/login'));

  response.cookies.set({ name: 'token', value: '', path: '/', maxAge: 0 });
  response.cookies.set({
    name: 'refreshToken',
    value: '',
    path: '/',
    maxAge: 0,
  });
  return response;
}

// ─── Middleware (async supported in Next.js 14+) ───────────────────
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith('/api');
  const isProtectedPage =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/teknisi') ||
    pathname.startsWith('/helpdesk');

  // Allow non-protected pages through
  if (!isApi && !isProtectedPage) {
    return NextResponse.next();
  }

  // Allow auth endpoints through
  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/refresh')
  ) {
    return NextResponse.next();
  }

  // ─── Extract token ───────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.get('token')?.value;

  if (!token) return respondUnauthorized(req);

  // ─── Verify token ────────────────────────────────────────────────
  let decoded: AccessTokenPayload;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return respondUnauthorized(req);
  }

  // ─── Redirect Loop Guard ─────────────────────────────────────────
  // If the request already came from a middleware redirect to the same
  // path, let it through to break the loop.
  const redirectTarget = req.headers.get('x-middleware-redirect');
  if (redirectTarget === pathname) {
    return NextResponse.next();
  }

  // ─── Teknisi Attendance Enforcement ──────────────────────────────
  if (decoded.role === 'teknisi') {
    const isAttendancePage = pathname.startsWith('/teknisi/attendance');
    const isAttendanceStatusApi =
      pathname.startsWith('/api/technicians/attendance/status');

    // For API routes (except attendance status), skip redirect.
    // This prevents fetch calls from becoming redirect loops.
    if (isApi && !isAttendanceStatusApi) {
      return NextResponse.next();
    }

    // Check attendance status from DB (real-time, no stale JWT issues)
    const status = await AttendanceService.getOwnStatus(decoded.id_user);
    const checkedInToday = status.checked_in;

    if (!checkedInToday) {
      // Teknisi belum absen → force ke attendance page
      if (!isAttendancePage) {
        const url = buildRedirectUrl(req, '/teknisi/attendance');
        const response = NextResponse.redirect(url);
        response.headers.set(
          'x-middleware-redirect',
          '/teknisi/attendance',
        );
        return response;
      }
    } else {
      // Sudah absen → block akses ke attendance page
      if (isAttendancePage) {
        const url = buildRedirectUrl(req, '/teknisi');
        const response = NextResponse.redirect(url);
        response.headers.set('x-middleware-redirect', '/teknisi');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - images, svgs (static assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
