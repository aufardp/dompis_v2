import jwt, { JwtPayload } from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const ACCESS_EXPIRY = '4h';
const REFRESH_EXPIRY = '7d';

interface AuthPayload extends JwtPayload {
  id_user: number;
  role: string;
}

/* =====================================================
   SIGN TOKEN
===================================================== */

export function signAccessToken(payload: AuthPayload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: ACCESS_EXPIRY,
  });
}

export function signRefreshToken(payload: AuthPayload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: REFRESH_EXPIRY,
  });
}

/* =====================================================
   VERIFY TOKEN (SAFE)
===================================================== */

export function verifyAccessToken(token: string): AuthPayload {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AuthPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): AuthPayload {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as AuthPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/* =====================================================
   GET USER FROM REQUEST
===================================================== */

export function getUserFromRequest(req: NextRequest): AuthPayload {
  const authHeader = req.headers.get('authorization');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.get('token')?.value;

  if (!token) throw new Error('Unauthorized - Missing token');

  return verifyAccessToken(token);
}
