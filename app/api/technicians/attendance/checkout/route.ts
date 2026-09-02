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

    let workzoneIds: number | number[] | undefined;
    try {
      const body = await request.json().catch(() => null);
      if (body) {
        if (Array.isArray(body.workzone_ids)) workzoneIds = body.workzone_ids as number[];
        else if (typeof body.workzone_id === 'number') workzoneIds = body.workzone_id;
        else if (Array.isArray(body.workzone_id)) workzoneIds = body.workzone_id as number[];
      }
    } catch {
      // no body = checkout all pending
    }
    const result = await AttendanceService.checkOut(technicianId, workzoneIds);

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

export async function POST(request: NextRequest) {
  return PATCH(request);
}
