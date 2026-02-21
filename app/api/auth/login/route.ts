import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import bcrypt from 'bcryptjs';
import {
  signAccessToken,
  signRefreshToken,
  createDefaultAttendancePayload,
  AccessTokenPayload,
} from '@/app/libs/auth';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { roleKeyToRoleId } from '@/app/libs/roles';

export async function POST(req: Request) {
  const { username, password } = await req.json();

  const user = await prisma.users.findFirst({
    where: { username },
    include: { roles: { select: { key: true } } },
  });

  if (!user)
    return NextResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 },
    );

  const valid = await bcrypt.compare(password, user.password || '');

  if (!valid)
    return NextResponse.json(
      { success: false, message: 'Invalid credentials' },
      { status: 401 },
    );

  const role = user.roles?.key || '';
  const role_id = roleKeyToRoleId(
    role as 'superadmin' | 'admin' | 'helpdesk' | 'teknisi',
  );

  let workzone: string[] = [];
  if (role === 'teknisi') {
    const userSa = await prisma.user_sa.findMany({
      where: { user_id: user.id_user },
      include: { service_area: { select: { nama_sa: true } } },
    });
    workzone = userSa
      .map((us) => us.service_area?.nama_sa)
      .filter((nama): nama is string => !!nama);
  }

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

  const payload: AccessTokenPayload = {
    id_user: user.id_user,
    role,
    role_id,
    workzone: workzone.length > 0 ? workzone : undefined,
    ...attendancePayload,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const response = NextResponse.json({
    success: true,
    accessToken,
    role,
    needsAttendanceCheck:
      role === 'teknisi' && !attendancePayload.attendance_checked_in,
  });

  response.cookies.set({
    name: 'token',
    value: accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });

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
}
