import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import {
  signAccessToken,
  signRefreshToken,
  createDefaultAttendancePayload,
  AccessTokenPayload,
} from '@/app/libs/auth';

import { AttendanceService } from '@/app/libs/services/attendance.service';
import { roleKeyToRoleId } from '@/app/libs/roles';
import {
  findUserByUsername,
  findUserWorkzones,
} from '@/app/libs/services/users.service';
import { checkRateLimit } from '@/lib/ratelimit';
import { buildRateLimitIdentifier } from '@/lib/rate-limit-identifiers';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  assertSameOriginRequest,
  getSecureCookieOptions,
} from '@/app/libs/request-security';
import { logger } from '@/lib/observability/logger';

type LoginRequest = {
  username: string;
  password: string;
};

export async function POST(req: Request) {
  try {
    const loginSchema = z.object({
      username: z.string().min(1, 'Username required'),
      password: z.string().min(1, 'Password required'),
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
    const { username, password } = parsed.data;

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

    const role = user.role_key ?? '';

    const role_id = roleKeyToRoleId(
      role as 'superadmin' | 'admin' | 'helpdesk' | 'teknisi',
    );

    /**
     * Workzone (only for teknisi)
     */
    let workzone: string[] = [];

    if (role === 'teknisi') {
      workzone = await findUserWorkzones(user.id_user);
    }

    /**
     * Attendance
     */
    const attendancePayload = createDefaultAttendancePayload();
    const today = AttendanceService.getTodayDateString();

    if (role === 'teknisi') {
      const todayStatus = await AttendanceService.getOwnStatus(user.id_user);

      if (todayStatus.checked_in) {
        attendancePayload.attendance_checked_in = true;
        attendancePayload.attendance_date = today;
        attendancePayload.attendance_status = todayStatus.status;
        attendancePayload.attendance_check_in_at = todayStatus.check_in_at;
      } else {
        attendancePayload.attendance_date = today;
      }
    }

    /**
     * JWT Payload
     */
    const payload: AccessTokenPayload = {
      id_user: user.id_user,
      role,
      role_id,
      workzone: workzone.length ? workzone : undefined,
      ...attendancePayload,
    };

    /**
     * Generate Tokens
     */
    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);

    const response = NextResponse.json({
      success: true,
      accessToken,
      role,
      needsAttendanceCheck:
        role === 'teknisi' && !attendancePayload.attendance_checked_in,
    });

    /**
     * Access Token Cookie
     */
    response.cookies.set({
      name: 'token',
      value: accessToken,
      ...getSecureCookieOptions(60 * 60),
    });

    /**
     * Refresh Token Cookie
     */
    response.cookies.set({
      name: 'refreshToken',
      value: refreshToken,
      ...getSecureCookieOptions(60 * 60 * 24 * 7),
    });

    return response;
  } catch (error) {
    logger.error('[LOGIN_ERROR]', error);

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
