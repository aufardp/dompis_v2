import { cookies, headers } from 'next/headers';
import { verifyAccessToken } from './auth';
import { ApiError } from './apiError';

export async function protectApi(
  allowedRoles: string[] = [],
  opts: { strict?: boolean } = {},
) {
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
    decoded = await verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Unauthorized - Invalid or expired token');
  }

  if (
    allowedRoles.length > 0 &&
    !isRoleAllowed(decoded.role, allowedRoles, opts.strict)
  ) {
    throw new ApiError(403, 'Forbidden - Access denied');
  }

  return decoded;
}

/**
 * Role hierarchy check.
 * `senior_leader` and `admin_branch` are granted the same access as
 * `admin`/`superadmin` (admin-equivalent roles with restricted menus).
 * When `strict` is true, no equivalence mapping is applied (exact match only).
 */
function isRoleAllowed(
  role: string,
  allowedRoles: string[],
  strict?: boolean,
): boolean {
  if (allowedRoles.includes(role)) return true;

  if (strict) return false;

  if (role === 'senior_leader' || role === 'admin_branch') {
    return allowedRoles.includes('admin') || allowedRoles.includes('superadmin');
  }

  return false;
}
