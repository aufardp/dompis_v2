import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  verifyRefreshToken,
  signAccessToken,
  AccessTokenPayload,
} from '@/app/libs/auth';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import {
  assertSameOriginRequest,
  getSecureCookieOptions,
  getAccessTokenCookieMaxAge,
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
    namespace: 'auth-refresh',
    limit: 20,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('refreshToken')?.value;

  if (!refreshToken)
    return NextResponse.json(
      { success: false, message: 'No refresh token' },
      { status: 401 },
    );

  try {
    const decoded = await verifyRefreshToken(refreshToken);

    const today = AttendanceService.getTodayDateString();

    const needsReset =
      decoded.attendance_date && decoded.attendance_date !== today;

    const newPayload: AccessTokenPayload = {
      id_user: decoded.id_user,
      role: decoded.role,
      role_id: decoded.role_id,
      workzone: decoded.workzone,
      attendance_checked_in: needsReset ? false : decoded.attendance_checked_in,
      attendance_date: needsReset ? today : decoded.attendance_date,
      attendance_status: needsReset ? null : decoded.attendance_status,
      attendance_check_in_at: needsReset
        ? null
        : decoded.attendance_check_in_at,
    };

    const newAccessToken = await signAccessToken(newPayload);

    const response = NextResponse.json({
      success: true,
      accessToken: newAccessToken,
    });

    response.cookies.set({
      name: 'token',
      value: newAccessToken,
      ...getSecureCookieOptions(getAccessTokenCookieMaxAge()),
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid refresh token' },
      { status: 401 },
    );
  }
}
