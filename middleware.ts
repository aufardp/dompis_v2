import { NextResponse, NextRequest } from 'next/server';
import { normalizeRoleKey, type NormalizedRoleKey } from './app/libs/roles';

// --- CONFIGURATION & TYPES ---
type JwtPayload = {
  exp?: number;
  role?: string;
  id_user?: string;
  [key: string]: any;
};

const ROLE_HOME: Record<string, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  helpdesk: '/helpdesk',
  teknisi: '/teknisi',
};

const GUARDS = [
  { prefix: '/superadmin', allowed: ['superadmin'] },
  { prefix: '/admin', allowed: ['admin', 'superadmin'] },
  { prefix: '/helpdesk', allowed: ['helpdesk', 'superadmin'] },
  { prefix: '/teknisi', allowed: ['teknisi'] },
];

// --- JWT & CRYPTO HELPERS (Dari proxy.ts) ---
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson<T = unknown>(base64Url: string): T | null {
  try {
    return JSON.parse(
      new TextDecoder().decode(base64UrlToUint8Array(base64Url)),
    );
  } catch {
    return null;
  }
}

async function verifyJwtHs256(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const header = base64UrlDecodeJson<{ alg?: string }>(headerB64);
  if (!header || header.alg !== 'HS256') return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = base64UrlToUint8Array(sigB64);
  const ok = await crypto.subtle.verify(
    { name: 'HMAC' },
    key,
    sig as BufferSource,
    data,
  );
  return ok ? base64UrlDecodeJson<JwtPayload>(payloadB64) : null;
}

function isExpired(payload: JwtPayload | null) {
  if (!payload?.exp) return true;
  return payload.exp <= Math.floor(Date.now() / 1000);
}

// --- CORE FUNCTIONS ---
async function refreshAccessToken(req: NextRequest): Promise<string | null> {
  const refreshToken = req.cookies.get('refreshToken')?.value;
  if (!refreshToken) return null;

  const baseUrl = req.nextUrl.origin;
  try {
    const res = await fetch(new URL('/api/auth/refresh', baseUrl), {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') || '' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.accessToken || null;
  } catch {
    return null;
  }
}

function clearAuthAndRedirect(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.nextUrl.origin));
  res.cookies.delete('token');
  res.cookies.delete('refreshToken');
  return res;
}

// --- MAIN MIDDLEWARE ---
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // 1. Bypass untuk path publik & auth internal
  const isApi = pathname.startsWith('/api');
  if (
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  // 2. Role Guard Matching
  const guard = GUARDS.find(
    (g) => pathname === g.prefix || pathname.startsWith(g.prefix + '/'),
  );
  if (!guard && !isApi) return NextResponse.next();

  // 3. Token Verification & Refresh Logic
  let token =
    req.cookies.get('token')?.value ||
    req.headers.get('authorization')?.split(' ')[1];
  const secret = process.env.JWT_ACCESS_SECRET || '';
  let payload = token ? await verifyJwtHs256(token, secret) : null;

  let newAccessToken: string | null = null;

  // Jika token tidak ada/invalid/expired, coba refresh
  if (!token || !payload || isExpired(payload)) {
    newAccessToken = await refreshAccessToken(req);
    if (!newAccessToken)
      return isApi
        ? NextResponse.json({ success: false }, { status: 401 })
        : clearAuthAndRedirect(req);

    token = newAccessToken;
    payload = await verifyJwtHs256(token, secret);
    if (!payload) return clearAuthAndRedirect(req);
  }

  // 4. Authorization (Role Check)
  const userRole = normalizeRoleKey(String(payload.role || ''));
  if (guard && !guard.allowed.includes(userRole as any)) {
    const res = NextResponse.redirect(
      new URL(ROLE_HOME[userRole] || '/login', origin),
    );
    if (newAccessToken)
      res.cookies.set('token', newAccessToken, {
        httpOnly: true,
        path: '/',
        maxAge: 3600,
      });
    return res;
  }

  // 5. Final Response (Attach new token if refreshed)
  const res = NextResponse.next();
  if (newAccessToken) {
    res.cookies.set('token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
  }
  return res;
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
