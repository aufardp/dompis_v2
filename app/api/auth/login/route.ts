import { NextResponse } from 'next/server';
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

type LoginRequest = {
  username: string;
  password: string;
};

export async function POST(req: Request) {
  try {
    const body: LoginRequest = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'Username and password required' },
        { status: 400 },
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
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });

    /**
     * Refresh Token Cookie
     */
    response.cookies.set({
      name: 'refreshToken',
      value: refreshToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[LOGIN_ERROR]', error);

    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
