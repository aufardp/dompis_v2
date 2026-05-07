// ==========================================
// Middleware - Node.js Runtime (Fixed for Next.js 15)
// ==========================================

// Force to Node.js runtime to avoid Edge Runtime restrictions
export const runtime = 'nodejs';

import { NextResponse, NextRequest } from 'next/server';

// --- INLINE ROLE NORMALIZATION (no external import) ---
function normalizeRoleKey(role: string): string {
  const key = String(role || '').trim().toLowerCase();
  if (key === 'superadmin' || key === 'super_admin' || key === 'super-admin') {
    return 'superadmin';
  }
  if (key === 'admin') {
    return 'admin';
  }
  if (key === 'helpdesk') {
    return 'helpdesk';
  }
  if (key === 'teknisi' || key === 'technician') {
    return 'teknisi';
  }
  return '';
}

// --- CONFIG ---
const ROLE_HOME: Record<string, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  helpdesk: '/helpdesk',
  teknisi: '/teknisi',
};

// --- SAFE REDIRECT HELPER ---
function safeRedirect(req: NextRequest, path: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = '';
  return NextResponse.redirect(url);
}

// --- MAIN MIDDLEWARE ---
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. BYPASS — public / internal paths
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. TOKEN CHECK
  const token = req.cookies.get('token')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    return safeRedirect(req, '/login');
  }

  // 3. DECODE PAYLOAD (Edge-runtime safe; no Node crypto)
  let payload: any;
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new Error('Invalid JWT format');
    }

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    const decoded = atob(padded);
    payload = JSON.parse(decoded);
  } catch {
    const res = safeRedirect(req, '/login');
    res.cookies.delete('token');
    res.cookies.delete('refreshToken');
    return res;
  }

  // 4. EXPIRY CHECK
  if (payload?.exp && Date.now() >= payload.exp * 1000) {
    const res = safeRedirect(req, '/login');
    res.cookies.delete('token');
    res.cookies.delete('refreshToken');
    return res;
  }

  // 5. ROLE GUARD
  const userRole = normalizeRoleKey(String(payload?.role ?? ''));
  const roleHome = ROLE_HOME[userRole] ?? '/login';

  if (
    pathname.startsWith('/admin') &&
    userRole !== 'admin' &&
    userRole !== 'superadmin'
  ) {
    return safeRedirect(req, roleHome);
  }

  if (
    pathname.startsWith('/helpdesk') &&
    userRole !== 'helpdesk' &&
    userRole !== 'superadmin'
  ) {
    return safeRedirect(req, roleHome);
  }

  if (pathname.startsWith('/superadmin') && userRole !== 'superadmin') {
    return safeRedirect(req, roleHome);
  }

  if (pathname.startsWith('/teknisi') && userRole !== 'teknisi') {
    return safeRedirect(req, roleHome);
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