import { NextResponse } from 'next/server';
import {
  assertSameOriginRequest,
  clearSecureCookie,
} from '@/app/libs/request-security';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function POST(request: Request) {
  const sameOrigin = assertSameOriginRequest(request);
  if (!sameOrigin.ok) {
    return NextResponse.json(
      { success: false, message: sameOrigin.reason },
      { status: 403 },
    );
  }

  const rateLimited = await enforceApiRateLimit(request, {
    namespace: 'auth-logout',
    limit: 30,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const response = NextResponse.json({
    success: true,
    message: 'Logout berhasil',
  });

  clearSecureCookie(response, 'token');
  clearSecureCookie(response, 'refreshToken');
  // Clear legacy filter cookies — URL is now source of truth, prevent nyantol on next login
  const legacyOpts = { path: '/', maxAge: 0 } as const;
  response.cookies.set('dompis:selected-branch', '', legacyOpts);
  response.cookies.set('dompis:selected-workzone', '', legacyOpts);

  return response;
}
