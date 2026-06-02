import assert from 'node:assert/strict';
import { NextResponse } from 'next/server';
import {
  applySecurityHeaders,
  assertSameOriginRequest,
  clearSecureCookie,
  getSecureCookieOptions,
} from '@/app/libs/request-security';

function createRequest(headers: Record<string, string>) {
  return new Request('https://dompis.example.test/api/auth/login', {
    method: 'POST',
    headers,
  });
}

function testSameOriginAccepted() {
  const result = assertSameOriginRequest(
    createRequest({
      origin: 'https://dompis.example.test',
      host: 'dompis.example.test',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-origin',
    }),
  );

  assert.deepEqual(result, { ok: true });
}

function testCrossSiteRejected() {
  const result = assertSameOriginRequest(
    createRequest({
      origin: 'https://evil.example.test',
      host: 'dompis.example.test',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'cross-site',
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /cross-site/i);
  }
}

function testOriginMismatchRejected() {
  const result = assertSameOriginRequest(
    createRequest({
      origin: 'https://evil.example.test',
      host: 'dompis.example.test',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-origin',
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /origin mismatch/i);
  }
}

function testSecureCookieOptions() {
  const options = getSecureCookieOptions(3600);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal(options.maxAge, 3600);
}

function testClearSecureCookie() {
  const response = NextResponse.json({ ok: true });
  clearSecureCookie(response, 'token');
  const cookie = response.cookies.get('token');

  assert.ok(cookie);
  assert.equal(cookie?.value, '');
  assert.equal(cookie?.path, '/');
  assert.equal(cookie?.httpOnly, true);
}

function testSecurityHeaders() {
  const response = applySecurityHeaders(NextResponse.json({ ok: true }));

  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(
    response.headers.get('Referrer-Policy'),
    'strict-origin-when-cross-origin',
  );
  assert.match(
    response.headers.get('Content-Security-Policy') || '',
    /frame-ancestors 'none'/,
  );
}

function main() {
  testSameOriginAccepted();
  testCrossSiteRejected();
  testOriginMismatchRejected();
  testSecureCookieOptions();
  testClearSecureCookie();
  testSecurityHeaders();
  console.log('[test:phase7] request security helpers passed');
}

main();
