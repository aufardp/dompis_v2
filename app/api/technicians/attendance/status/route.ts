import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
    ]);
    const technicianId = decoded.id_user;

    const status = await AttendanceService.getOwnStatus(technicianId);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error: unknown) {
    console.error('GET /technicians/attendance/status error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching attendance status'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
