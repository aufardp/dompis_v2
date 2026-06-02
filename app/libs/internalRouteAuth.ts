import type { NextRequest } from 'next/server';
import { ApiError } from './apiError';
import { protectApi } from './protectApi';

const DEFAULT_ALLOWED_ROLES = ['admin', 'superadmin', 'super_admin'] as const;

export async function authorizeInternalRoute(
  request: NextRequest,
  allowedRoles: string[] = [...DEFAULT_ALLOWED_ROLES],
) {
  const secret = request.headers.get('x-cron-secret');
  const envSecret = process.env.CRON_SECRET;

  if (envSecret && secret === envSecret) {
    return { source: 'cron-secret' as const };
  }

  try {
    const user = await protectApi([...allowedRoles]);
    return { source: 'session' as const, user };
  } catch (error) {
    throw new ApiError(401, 'Unauthorized - Internal route');
  }
}
