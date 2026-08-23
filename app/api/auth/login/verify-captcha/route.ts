import { NextResponse } from 'next/server';
import { z } from 'zod';

import { assertSameOriginRequest, getSecureCookieOptions } from '@/app/libs/request-security';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { verifyLoginCaptchaAnswer } from '@/lib/auth/login-captcha';
import { finishLogin } from '@/app/libs/services/login-session.service';
import { logger } from '@/lib/observability/logger';

const verifySchema = z.object({
  challengeId: z.string().min(1),
  sliderX: z.number(),
});

export async function POST(req: Request) {
  try {
    const sameOrigin = assertSameOriginRequest(req);
    if (!sameOrigin.ok) {
      return NextResponse.json(
        { success: false, message: sameOrigin.reason },
        { status: 403 },
      );
    }

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'auth-login-captcha',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await verifyLoginCaptchaAnswer(parsed.data);

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          message: result.reason,
          ...(result.freshChallenge
            ? { requiresCaptcha: true, ...result.freshChallenge }
            : {}),
        },
        { status: 400 },
      );
    }

    const session = await finishLogin(result.id_user, result.remember);

    const response = NextResponse.json({
      success: true,
      accessToken: session.accessToken,
      role: session.role,
      needsAttendanceCheck: session.needsAttendanceCheck,
    });

    response.cookies.set({
      name: 'token',
      value: session.accessToken,
      ...getSecureCookieOptions(60 * 60),
    });

    response.cookies.set({
      name: 'refreshToken',
      value: session.refreshToken,
      ...getSecureCookieOptions(session.refreshExpirySeconds),
    });

    return response;
  } catch (error) {
    logger.error('[LOGIN_VERIFY_CAPTCHA_ERROR]', error);

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
