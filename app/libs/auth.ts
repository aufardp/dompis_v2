import jwt, { JwtPayload } from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const ACCESS_EXPIRY = '4h';
const REFRESH_EXPIRY = '7d';

export interface AccessTokenPayload extends JwtPayload {
  id_user: number;
  role: string;
  role_id: number;
  workzone?: string[];
  attendance_checked_in: boolean;
  attendance_date: string;
  attendance_status: 'PRESENT' | 'LATE' | null;
  attendance_check_in_at: string | null;
}

/* =====================================================
   SIGN TOKEN
===================================================== */

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: ACCESS_EXPIRY,
  });
}

export function signRefreshToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: REFRESH_EXPIRY,
  });
}

export function createDefaultAttendancePayload(): Pick<
  AccessTokenPayload,
  | 'attendance_checked_in'
  | 'attendance_date'
  | 'attendance_status'
  | 'attendance_check_in_at'
> {
  return {
    attendance_checked_in: false,
    attendance_date: '',
    attendance_status: null,
    attendance_check_in_at: null,
  };
}

/* =====================================================
   VERIFY TOKEN (SAFE)
===================================================== */

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!,
    ) as AccessTokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET!,
    ) as AccessTokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/* =====================================================
   GET USER FROM REQUEST
===================================================== */

export function getUserFromRequest(req: NextRequest): AccessTokenPayload {
  const authHeader = req.headers.get('authorization');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.get('token')?.value;

  if (!token) throw new Error('Unauthorized - Missing token');

  return verifyAccessToken(token);
}
