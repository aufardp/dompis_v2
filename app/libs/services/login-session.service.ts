import prisma from '@/app/libs/prisma';
import {
  signAccessToken,
  signRefreshToken,
  createDefaultAttendancePayload,
  AccessTokenPayload,
  REFRESH_EXPIRY_SHORT,
  REFRESH_EXPIRY_LONG,
} from '@/app/libs/auth';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { roleKeyToRoleId, NormalizedRoleKey } from '@/app/libs/roles';
import { findUserWorkzones } from '@/app/libs/services/users.service';

export type FinishLoginResult = {
  accessToken: string;
  refreshToken: string;
  refreshExpirySeconds: number;
  role: string;
  needsAttendanceCheck: boolean;
};

/**
 * Menyelesaikan proses login setelah kredensial (dan, kalau captcha aktif,
 * captcha) terverifikasi: susun payload JWT (role/workzone/attendance) dan
 * terbitkan access + refresh token. Tidak menyentuh NextResponse/cookie —
 * itu tanggung jawab pemanggil (route handler).
 */
export async function finishLogin(
  id_user: number,
  remember: boolean,
): Promise<FinishLoginResult> {
  const user = await prisma.users.findUnique({
    where: { id_user },
    include: { roles: { select: { key: true } } },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const role = user.roles?.key ?? '';
  const role_id = roleKeyToRoleId(role as NormalizedRoleKey);

  let workzone: string[] = [];
  if (role === 'teknisi') {
    workzone = await findUserWorkzones(user.id_user);
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
    workzone: workzone.length ? workzone : undefined,
    ...attendancePayload,
  };

  const refreshExpiresIn = remember ? REFRESH_EXPIRY_LONG : REFRESH_EXPIRY_SHORT;
  const refreshExpirySeconds = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24;

  const accessToken = await signAccessToken(payload);
  const refreshToken = await signRefreshToken(payload, refreshExpiresIn);

  return {
    accessToken,
    refreshToken,
    refreshExpirySeconds,
    role,
    needsAttendanceCheck: role === 'teknisi' && !attendancePayload.attendance_checked_in,
  };
}
