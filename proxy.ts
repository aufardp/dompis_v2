// ==========================================
// Middleware — Edge Runtime
// ==========================================

import { NextResponse, NextRequest } from 'next/server';
import { applySecurityHeaders, getSecureCookieOptions, getAccessTokenCookieMaxAge } from '@/app/libs/request-security';
import { logger } from '@/lib/observability/logger';

// --- JWT VERIFICATION (Web Crypto API, Edge-compatible) ---
async function verifyJWT(token: string, secret: string): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, sigB64] = parts;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const data = enc.encode(`${headerB64}.${payloadB64}`);
  const sig = Uint8Array.from(
    atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')),
    (c: string) => c.charCodeAt(0),
  );

  const valid = await crypto.subtle.verify('HMAC', key, sig, data);
  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

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
  if (key === 'senior_leader' || key === 'sl' || key === 'seniorleader') {
    return 'senior_leader';
  }
  if (key === 'admin_branch' || key === 'adminbranch') {
    return 'admin_branch';
  }
  return '';
}

// --- CONFIG ---
const ROLE_HOME: Record<string, string> = {
  superadmin: '/admin',
  admin: '/admin',
  senior_leader: '/admin',
  admin_branch: '/admin',
  helpdesk: '/helpdesk',
  teknisi: '/teknisi',
};

// --- MAIN MIDDLEWARE ---
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const correlationId = crypto.randomUUID();
  req.headers.set('x-correlation-id', correlationId);

  // Set only when a silent refresh (see tryRefreshSession below) mints a new
  // access token — attached to whichever response we end up returning so the
  // renewed session isn't dropped on a role-guard redirect.
  let refreshedAccessToken: string | null = null;

  function withCorrelation(res: NextResponse): NextResponse {
    res.headers.set('x-correlation-id', correlationId);
    return res;
  }

  function withRefreshedToken(res: NextResponse): NextResponse {
    if (refreshedAccessToken) {
      res.cookies.set({
        name: 'token',
        value: refreshedAccessToken,
        ...getSecureCookieOptions(getAccessTokenCookieMaxAge()),
      });
    }
    return res;
  }

  function safeRedirect(path: string): NextResponse {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    return withRefreshedToken(withCorrelation(applySecurityHeaders(NextResponse.redirect(url))));
  }

  // Exchange a still-valid refreshToken cookie for a fresh access token by
  // calling our own /api/auth/refresh route (Node runtime — it touches
  // Prisma/attendance data, which can't run here in the Edge runtime).
  async function tryRefreshSession(): Promise<any | null> {
    const refreshToken = req.cookies.get('refreshToken')?.value;
    if (!refreshToken) return null;

    try {
      const refreshUrl = new URL('/api/auth/refresh', req.nextUrl.origin);
      const forwardedFor = req.headers.get('x-forwarded-for');

      const refreshRes = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          cookie: `refreshToken=${refreshToken}`,
          ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        },
      });

      if (!refreshRes.ok) return null;

      const data: any = await refreshRes.json().catch(() => null);
      if (!data?.success || !data?.accessToken) return null;

      const jwtSecret = process.env.JWT_ACCESS_SECRET;
      if (!jwtSecret) return null;

      const newPayload = await verifyJWT(data.accessToken, jwtSecret);
      refreshedAccessToken = data.accessToken;
      return newPayload;
    } catch (err) {
      logger.error('Silent session refresh failed:', {
        error:
          err instanceof Error
            ? (err.stack ?? err.message)
            : (() => {
                try {
                  return JSON.stringify(err);
                } catch {
                  return String(err);
                }
              })(),
      });
      return null;
    }
  }

  // API routes → correlation, security headers, cache-control, skip page auth
  if (pathname.startsWith('/api/')) {
    const res = withCorrelation(applySecurityHeaders(NextResponse.next()));

    // Reference data — branch/workzone is per-user (role/branch scope), must not be shared across accounts in same browser
    if (
      pathname === '/api/area' ||
      pathname === '/api/roles' ||
      pathname === '/api/region'
    ) {
      res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
    } else if (
      pathname === '/api/branch/options' ||
      pathname.startsWith('/api/workzone')
    ) {
      res.headers.set('Cache-Control', 'private, max-age=30, must-revalidate');
      res.headers.set('Vary', 'Cookie');
    }
    // Dashboard data — already server-cached via getOrSetCache
    else if (pathname.startsWith('/api/dashboard/')) {
      res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    }
    // Technicians reference data
    else if (pathname === '/api/technicians' || pathname === '/api/sa') {
      res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    }
    // Everything else — no cache
    else {
      res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    return res;
  }

  // 1. BYPASS — public / internal page paths
  if (
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return withCorrelation(applySecurityHeaders(NextResponse.next()));
  }

  // 2. TOKEN CHECK, VERIFY, AND EXPIRY — with a silent-refresh fallback
  const token = req.cookies.get('token')?.value;
  let payload: any;

  if (token) {
    try {
      const jwtSecret = process.env.JWT_ACCESS_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_ACCESS_SECRET not set');
      }
      payload = await verifyJWT(token, jwtSecret);

      if (payload?.exp && Date.now() >= payload.exp * 1000) {
        payload = undefined;
      }
    } catch (err) {
      logger.error('JWT verification failed:', { error: err instanceof Error ? err.message : 'Unknown error' });
      payload = undefined;
    }
  }

  if (!payload) {
    payload = await tryRefreshSession();

    if (!payload) {
      const res = safeRedirect('/login');
      res.cookies.delete('token');
      res.cookies.delete('refreshToken');
      return res;
    }
  }

  // 5. ROLE GUARD
  const userRole = normalizeRoleKey(String(payload?.role ?? ''));
  const roleHome = ROLE_HOME[userRole] ?? '/login';

  // helpdesk hanya boleh akses Tools index + War Map (keputusan v1.3 / v1.4)
  // -> prefix /admin/tools/* diwhitelist, bukan seluruhnya, supaya
  //    tools admin-only (mis. Import Tiket) tidak bocor ke helpdesk.
  const isHelpdeskToolsPath =
    pathname === '/admin/tools' ||
    pathname.startsWith('/admin/tools/war-map') ||
    pathname.startsWith('/admin/tools/import-kml');
  const isToolsAllowedToHelpdesk = isHelpdeskToolsPath && userRole === 'helpdesk';

  if (pathname.startsWith('/admin')) {
    const isAdminRole =
      userRole === 'admin' ||
      userRole === 'superadmin' ||
      userRole === 'senior_leader' ||
      userRole === 'admin_branch';

    if (!isAdminRole && !isToolsAllowedToHelpdesk) {
      return safeRedirect(roleHome);
    }
  }

  if (
    pathname.startsWith('/helpdesk') &&
    userRole !== 'helpdesk' &&
    userRole !== 'superadmin' &&
    userRole !== 'senior_leader'
  ) {
    return safeRedirect(roleHome);
  }

  if (pathname.startsWith('/superadmin')) {
    const isUsersPage =
      pathname === '/superadmin/users' ||
      pathname.startsWith('/superadmin/users/');
    const allowed =
      userRole === 'superadmin' ||
      (userRole === 'admin_branch' && isUsersPage);
    if (!allowed) {
      return safeRedirect(roleHome);
    }
  }

  if (pathname.startsWith('/teknisi') && userRole !== 'teknisi') {
    return safeRedirect(roleHome);
  }

  return withRefreshedToken(withCorrelation(applySecurityHeaders(NextResponse.next())));
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/helpdesk/:path*',
    '/superadmin/:path*',
    '/teknisi/:path*',
  ],
};
