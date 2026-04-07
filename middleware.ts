import { NextResponse, NextRequest } from 'next/server';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { normalizeRoleKey } from './app/libs/roles';

// --- CONFIG & HELPERS ---
const ROLE_HOME: Record<string, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  helpdesk: '/helpdesk',
  teknisi: '/teknisi',
};

// Fungsi redirect yang aman dari tumpukan URL
function absoluteRedirect(req: NextRequest, path: string) {
  const host = req.headers.get('host') || 'dompis.ta-branchsby.co.id';
  // Gunakan string literal untuk memastikan double slash (//)
  const url = `https://${host}${path}`;
  return NextResponse.redirect(url);
}

// Helper JWT Sederhana untuk Edge Runtime
async function getPayload(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protocol = req.headers.get('x-forwarded-proto');

  // 1. BYPASS LOGIC
  // Jika sudah di https (dari nginx) atau path publik, jangan redirect protokol
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname === '/_next' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. TOKEN & AUTH
  const token = req.cookies.get('token')?.value;
  if (!token) {
    if (pathname.startsWith('/api'))
      return NextResponse.json({ success: false }, { status: 401 });
    return pathname === '/login'
      ? NextResponse.next()
      : absoluteRedirect(req, '/login');
  }

  const payload = await getPayload(token);
  if (
    !payload ||
    (payload.exp && payload.exp <= Math.floor(Date.now() / 1000))
  ) {
    const res = absoluteRedirect(req, '/login');
    res.cookies.delete('token');
    return res;
  }

  // 3. ROLE & ATTENDANCE GUARD
  const userRole = normalizeRoleKey(String(payload.role || ''));
  const isTeknisi = userRole === 'teknisi';

  // Proteksi Folder: Jika admin mau masuk ke /teknisi atau sebaliknya
  if (
    pathname.startsWith('/admin') &&
    userRole !== 'admin' &&
    userRole !== 'superadmin'
  ) {
    return absoluteRedirect(req, ROLE_HOME[userRole]);
  }
  if (pathname.startsWith('/teknisi') && !isTeknisi) {
    return absoluteRedirect(req, ROLE_HOME[userRole]);
  }

  // Khusus Teknisi Attendance
  if (isTeknisi) {
    const isAttendancePage = pathname === '/teknisi/attendance';
    // Hanya cek DB jika bukan request API biasa (biar hemat resource)
    if (
      !pathname.startsWith('/api') ||
      pathname.startsWith('/api/technicians/attendance/status')
    ) {
      const status = await AttendanceService.getOwnStatus(payload.id_user);
      if (!status.checked_in && !isAttendancePage)
        return absoluteRedirect(req, '/teknisi/attendance');
      if (status.checked_in && isAttendancePage)
        return absoluteRedirect(req, '/teknisi');
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/helpdesk/:path*',
    '/superadmin/:path*',
    '/teknisi/:path*',
    '/api/((?!auth).*)',
  ],
};
