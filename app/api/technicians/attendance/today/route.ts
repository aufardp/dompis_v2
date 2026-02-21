import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'teknisi']);

    const presentIds = await AttendanceService.getTodayPresentTechnicianIds();

    return NextResponse.json({
      success: true,
      data: {
        present_technician_ids: presentIds,
        present_count: presentIds.length,
      },
    });
  } catch (error: unknown) {
    console.error('GET /technicians/attendance/today error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching today attendance'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
