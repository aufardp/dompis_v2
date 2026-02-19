import { cookies, headers } from 'next/headers';
import { verifyAccessToken } from './auth';
import { ApiError } from './apiError';

export async function protectApi(allowedRoles: string[] = []) {
  let token: string | undefined;

  // 🔹 1. Check Authorization Bearer
  const headerList = await headers();
  const authHeader = headerList.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 🔹 2. Fallback to cookie
  if (!token) {
    const cookieStore = await cookies();
    token = cookieStore.get('token')?.value;
  }

  if (!token) throw new ApiError(401, 'Unauthorized - No token');

  let decoded: any;

  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Unauthorized - Invalid or expired token');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
    throw new ApiError(403, 'Forbidden - Access denied');
  }

  return decoded;
}
