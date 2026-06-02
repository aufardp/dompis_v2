import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getCurrentUser } from '@/app/libs/services/users.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { logger } from '@/lib/observability/logger';

export async function GET() {
  try {
    const decoded = await protectApi();
    const user = await getCurrentUser(decoded.id_user);

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    const status = getErrorStatus(error, 500);
    if (status >= 500) {
      logger.error('Route error:', error);
    } else {
      logger.warn('Route error:', { error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } });
    }
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to load current user') },
      { status },
    );
  }
}
