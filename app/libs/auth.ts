import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

const ACCESS_EXPIRY = '4h';
export const REFRESH_EXPIRY_SHORT = '1d';
export const REFRESH_EXPIRY_LONG = '30d';
type TokenType = 'access' | 'refresh';

export interface AccessTokenPayload {
  id_user: number;
  role: string;
  role_id: number;
  workzone?: string[];
  attendance_checked_in: boolean;
  attendance_date: string;
  attendance_status: 'PRESENT' | 'LATE' | null;
  attendance_check_in_at: string | null;
}

type VerifiedTokenPayload = AccessTokenPayload & {
  token_type?: TokenType;
};

const getAccessSecret = () => new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const getRefreshSecret = () => new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

export function signAccessToken(payload: AccessTokenPayload) {
  return new SignJWT({ ...payload, token_type: 'access' satisfies TokenType })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(getAccessSecret());
}

export function signRefreshToken(
  payload: AccessTokenPayload,
  expiresIn: string = REFRESH_EXPIRY_SHORT,
) {
  return new SignJWT({ ...payload, token_type: 'refresh' satisfies TokenType })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(getRefreshSecret());
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

async function verifyTokenWithSecret(
  token: string,
  secret: Uint8Array,
): Promise<VerifiedTokenPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as VerifiedTokenPayload;
}

function assertTokenType(
  payload: VerifiedTokenPayload,
  expected: TokenType,
  fallbackError: string,
) {
  if (payload.token_type && payload.token_type !== expected) {
    throw new Error(fallbackError);
  }
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const payload = await verifyTokenWithSecret(token, getAccessSecret());
    assertTokenType(payload, 'access', 'Invalid token type for access token');
    return payload;
  } catch (error: any) {
    throw new Error(
      `Invalid or expired access token (${error?.name || 'UnknownError'})`,
    );
  }
}

export async function verifyRefreshToken(token: string): Promise<AccessTokenPayload> {
  try {
    const payload = await verifyTokenWithSecret(token, getRefreshSecret());
    assertTokenType(payload, 'refresh', 'Invalid token type for refresh token');
    return payload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

export async function getUserFromRequest(req: NextRequest): Promise<AccessTokenPayload> {
  const authHeader = req.headers.get('authorization');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.get('token')?.value;

  if (!token) throw new Error('Unauthorized - Missing token');

  return verifyAccessToken(token);
}
