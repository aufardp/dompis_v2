import type { NextRequest, NextResponse } from 'next/server';

const SENSITIVE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function parseExpiryToSeconds(value: string, fallbackSeconds: number): number {
  const normalized = String(value || '').trim().toLowerCase();
  const match = normalized.match(/^(\d+)\s*([smhd])$/);
  if (!match) return fallbackSeconds;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return amount;
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 60 * 60;
  if (unit === 'd') return amount * 60 * 60 * 24;
  return fallbackSeconds;
}

export function getAccessTokenCookieMaxAge(): number {
  const expiry = process.env.JWT_ACCESS_EXPIRY || '12h';
  return parseExpiryToSeconds(expiry, 12 * 60 * 60);
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

export function getSecureCookieOptions(maxAge: number) {
  return {
    ...SENSITIVE_COOKIE_OPTIONS,
    maxAge,
  };
}

export function clearSecureCookie(
  response: NextResponse,
  name: string,
): void {
  response.cookies.set({
    ...SENSITIVE_COOKIE_OPTIONS,
    name,
    value: '',
    maxAge: 0,
  });
}

export function assertSameOriginRequest(
  request: Request | NextRequest,
): { ok: true } | { ok: false; reason: string } {
  const originHeader = request.headers.get('origin');
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protoHeader =
    request.headers.get('x-forwarded-proto') ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const fetchSite = request.headers.get('sec-fetch-site');

  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    return { ok: false, reason: 'Cross-site request blocked' };
  }

  if (!originHeader) {
    return { ok: true };
  }

  if (!hostHeader) {
    return { ok: false, reason: 'Unable to validate request origin' };
  }

  const requestOrigin = normalizeOrigin(originHeader);
  const expectedOrigin = normalizeOrigin(`${protoHeader}://${hostHeader}`);

  if (!requestOrigin || !expectedOrigin || requestOrigin !== expectedOrigin) {
    return { ok: false, reason: 'Origin mismatch' };
  }

  return { ok: true };
}

export function applySecurityHeaders<T extends NextResponse>(response: T): T {
  const isDev = process.env.NODE_ENV === 'development';

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site');

  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline' https://static.cloudflareinsights.com";
  const connectSrc = isDev
    ? "'self' ws: wss: https://nominatim.openstreetmap.org"
    : "'self' https://nominatim.openstreetmap.org";

  response.headers.set(
    'Content-Security-Policy',
    [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https://*.tile.openstreetmap.org",
      `connect-src ${connectSrc}`,
      "font-src 'self' https://fonts.gstatic.com",
    ].join('; '),
  );
  return response;
}
