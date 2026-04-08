import { NextResponse, NextRequest } from 'next/server';
import { normalizeRoleKey } from './app/libs/roles';

// --- CONFIG ---
const ROLE_HOME: Record<string, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  helpdesk: '/helpdesk',
  teknisi: '/teknisi',
};

// --- SAFE REDIRECT HELPER ---
// Always produces absolute https:// URLs to prevent double-slash / path-stacking bugs
function safeRedirect(req: NextRequest, path: string): NextResponse {
  const host = req.headers.get('host') ?? req.nextUrl.host;
  const url = `https://${host}${path}`;
  return NextResponse.redirect(url);
}

// --- JWT DECODER (Edge-compatible, no verification) ---
// Relies on cookie signature already verified by the auth flow
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// --- MAIN MIDDLEWARE ---
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. BYPASS — public / internal paths
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. ENFORCE HTTPS via X-Forwarded-Proto (set by Nginx SSL terminator)
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto !== 'https') {
    return safeRedirect(req, pathname);
  }

  // 3. TOKEN CHECK
  const token = req.cookies.get('token')?.value;
  if (!token) {
    if (pathname.startsWith('/api'))
      return NextResponse.json({ success: false }, { status: 401 });
    return pathname === '/login'
      ? NextResponse.next()
      : safeRedirect(req, '/login');
  }

  // 4. DECODE & VALIDATE
  const payload = decodeJwtPayload(token);
  if (
    !payload ||
    (typeof payload.exp === 'number' &&
      payload.exp <= Math.floor(Date.now() / 1000))
  ) {
    const res = safeRedirect(req, '/login');
    res.cookies.delete('token');
    res.cookies.delete('refreshToken');
    return res;
  }

  // 5. ROLE GUARD
  const userRole = normalizeRoleKey(String(payload.role ?? ''));

  // /admin → only admin & superadmin
  if (
    pathname.startsWith('/admin') &&
    userRole !== 'admin' &&
    userRole !== 'superadmin'
  ) {
    return safeRedirect(req, ROLE_HOME[userRole] ?? '/login');
  }

  // /helpdesk → only helpdesk & superadmin
  if (
    pathname.startsWith('/helpdesk') &&
    userRole !== 'helpdesk' &&
    userRole !== 'superadmin'
  ) {
    return safeRedirect(req, ROLE_HOME[userRole] ?? '/login');
  }

  // /superadmin → only superadmin
  if (pathname.startsWith('/superadmin') && userRole !== 'superadmin') {
    return safeRedirect(req, ROLE_HOME[userRole] ?? '/login');
  }

  // /teknisi → only teknisi
  if (pathname.startsWith('/teknisi') && userRole !== 'teknisi') {
    return safeRedirect(req, ROLE_HOME[userRole] ?? '/login');
  }

  // 6. ALLOW (attendance enforcement is handled client-side in teknisi layout)
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
