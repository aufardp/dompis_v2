import type { NextRequest, NextResponse } from 'next/server';

const SENSITIVE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

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

export function applySecurityHeaders<T extends NextResponse>(
  response: T,
  nonce?: string,
): T {
  const isDev = process.env.NODE_ENV === 'development';

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site');

  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  let scriptSrc: string;
  if (isDev) {
    scriptSrc = "'self' 'unsafe-inline' 'unsafe-eval'";
  } else if (nonce) {
    scriptSrc = `'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`;
  } else {
    scriptSrc = "'self'";
  }

  const connectSrc = isDev ? "'self' ws: wss:" : "'self'";

  response.headers.set(
    'Content-Security-Policy',
    [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data:",
      `connect-src ${connectSrc}`,
      "font-src 'self' https://fonts.gstatic.com",
    ].join('; '),
  );
  return response;
}
