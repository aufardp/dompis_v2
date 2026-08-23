import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { findUserByUsername } from '@/app/libs/services/users.service';
import { checkRateLimit } from '@/lib/ratelimit';
import { buildRateLimitIdentifier } from '@/lib/rate-limit-identifiers';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { assertSameOriginRequest } from '@/app/libs/request-security';
import { createLoginCaptchaChallenge } from '@/lib/auth/login-captcha';
import { logger } from '@/lib/observability/logger';

export async function POST(req: Request) {
  try {
    const loginSchema = z.object({
      username: z.string().min(1, 'Username required'),
      password: z.string().min(1, 'Password required'),
      remember: z.boolean().optional().default(false),
    });

    const sameOrigin = assertSameOriginRequest(req);
    if (!sameOrigin.ok) {
      return NextResponse.json(
        { success: false, message: sameOrigin.reason },
        { status: 403 },
      );
    }

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'auth-login',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { username, password, remember } = parsed.data;

    const rateLimitResult = await checkRateLimit(
      buildRateLimitIdentifier(req, 'auth-login', { username }),
      10,
      60,
      { failOpen: false },
    );

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.reason === 'rate_limiter_unavailable') {
        return NextResponse.json(
          {
            success: false,
            message: 'Login sementara tidak tersedia. Silakan coba lagi beberapa saat.',
          },
          { status: 503 },
        );
      }

      const retryAfter = Math.max(
        1,
        rateLimitResult.resetAt - Math.floor(Date.now() / 1000),
      );

      return NextResponse.json(
        {
          success: false,
          message: 'Too many login attempts. Please try again later.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, user.password ?? '');

    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials' },
        { status: 401 },
      );
    }

    /**
     * Kredensial valid — jangan terbitkan sesi dulu. Minta user menyelesaikan
     * slider captcha lewat /api/auth/login/verify-captcha; sesi baru terbit
     * setelah captcha itu benar.
     */
    const challenge = await createLoginCaptchaChallenge({
      id_user: user.id_user,
      remember,
    });

    return NextResponse.json({
      success: true,
      requiresCaptcha: true,
      ...challenge,
    });
  } catch (error) {
    logger.error('[LOGIN_ERROR]', error);

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
