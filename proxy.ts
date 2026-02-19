import { NextResponse, type NextRequest } from 'next/server';
import { normalizeRoleKey, type NormalizedRoleKey } from './app/libs/roles';

type JwtPayload = {
  exp?: number;
  role?: string;
  [key: string]: unknown;
};

type GuardRule = {
  prefix: string;
  allowed: readonly NormalizedRoleKey[];
};

const ROLE_HOME: Record<NormalizedRoleKey, string> = {
  superadmin: '/superadmin',
  admin: '/admin',
  helpdesk: '/helpdesk',
  teknisi: '/teknisi',
};

const GUARDS: readonly GuardRule[] = [
  { prefix: '/superadmin', allowed: ['superadmin'] },
  { prefix: '/admin', allowed: ['admin', 'superadmin'] },
  { prefix: '/helpdesk', allowed: ['helpdesk', 'superadmin'] },
  { prefix: '/teknisi', allowed: ['teknisi'] },
];

function matchPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');

  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64UrlDecodeJson<T = unknown>(base64Url: string): T | null {
  try {
    const bytes = base64UrlToUint8Array(base64Url);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function parseJwtPayloadUnsafe(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return base64UrlDecodeJson<JwtPayload>(parts[1]);
}

function getJwtExp(payload: JwtPayload | null | undefined): number | null {
  const exp = payload?.exp;
  if (typeof exp === 'number' && Number.isFinite(exp)) return exp;
  if (typeof exp === 'string') {
    const n = Number(exp);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isExpired(payload: JwtPayload | null | undefined) {
  const exp = getJwtExp(payload);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp <= now;
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

  const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigBytes = base64UrlToUint8Array(sigB64);

  const ok = await crypto.subtle.verify(
    { name: 'HMAC' },
    key,
    toArrayBuffer(sigBytes),
    toArrayBuffer(dataBytes),
  );
  if (!ok) return null;

  return base64UrlDecodeJson<JwtPayload>(payloadB64);
}

async function parseJwtPayload(token: string): Promise<JwtPayload | null> {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (secret) {
    return verifyJwtHs256(token, secret);
  }

  return parseJwtPayloadUnsafe(token);
}

async function refreshAccessToken(req: NextRequest): Promise<string | null> {
  const refreshToken = req.cookies.get('refreshToken')?.value;
  if (!refreshToken) return null;

  const res = await fetch(new URL('/api/auth/refresh', req.url), {
    method: 'POST',
    headers: {
      cookie: req.headers.get('cookie') || '',
    },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const nextToken = json?.accessToken;
  return typeof nextToken === 'string' && nextToken.length > 10
    ? nextToken
    : null;
}

function setAccessCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: 'token',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 hour
    path: '/',
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guard = GUARDS.find((g) => matchPrefix(pathname, g.prefix));
  if (!guard) return NextResponse.next();

  let accessToken = req.cookies.get('token')?.value;
  let payload: JwtPayload | null = accessToken
    ? await parseJwtPayload(accessToken)
    : null;

  // If missing/invalid/expired, try refresh once (if refreshToken exists)
  if (!accessToken || !payload || isExpired(payload)) {
    const refreshed = await refreshAccessToken(req);
    if (!refreshed) {
      const res = redirectTo(req, '/login');
      res.cookies.delete('token');
      res.cookies.delete('refreshToken');
      return res;
    }

    accessToken = refreshed;
    payload = await parseJwtPayload(refreshed);
  }

  if (!payload || isExpired(payload)) {
    const res = redirectTo(req, '/login');
    res.cookies.delete('token');
    res.cookies.delete('refreshToken');
    return res;
  }

  let role: NormalizedRoleKey;
  try {
    role = normalizeRoleKey(String(payload.role || ''));
  } catch {
    const res = redirectTo(req, '/login');
    res.cookies.delete('token');
    res.cookies.delete('refreshToken');
    return res;
  }

  if (!guard.allowed.includes(role)) {
    const res = redirectTo(req, ROLE_HOME[role]);
    if (accessToken) setAccessCookie(res, accessToken);
    return res;
  }

  const res = NextResponse.next();
  if (accessToken) setAccessCookie(res, accessToken);
  return res;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/helpdesk/:path*',
    '/superadmin/:path*',
    '/teknisi/:path*',
  ],
};
