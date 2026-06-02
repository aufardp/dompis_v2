import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { logger } from '@/lib/observability/logger';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
    ]);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'attendance-checkout',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const technicianId = decoded.id_user;

    const result = await AttendanceService.checkOut(technicianId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        check_out_at: result.check_out_at,
      },
    });
  } catch (error: unknown) {
    logger.error('PATCH /technicians/attendance/checkout error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error check-out'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
