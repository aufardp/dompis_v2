import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { AttendanceCheckInInput } from '@/app/types/attendance';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const decoded = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
    ]);
    const technicianId = decoded.id_user;

    const body: AttendanceCheckInInput = await request.json();

    if (!body.workzone_id) {
      return NextResponse.json(
        { success: false, message: 'workzone_id wajib diisi' },
        { status: 400 },
      );
    }

    const result = await AttendanceService.checkIn(
      technicianId,
      body.workzone_id,
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        check_in_at: result.check_in_at,
        status: result.status,
      },
    });
  } catch (error: unknown) {
    console.error('POST /technicians/attendance error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error check-in'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    const technicianIdParam = searchParams.get('technician_id');

    const month = monthParam
      ? parseInt(monthParam)
      : AttendanceService.getTodayMonth();
    const year = yearParam
      ? parseInt(yearParam)
      : AttendanceService.getTodayYear();
    const technicianId = technicianIdParam
      ? parseInt(technicianIdParam)
      : undefined;

    const technicianIds = technicianId ? [technicianId] : undefined;

    const result = await AttendanceService.getMonthlyAttendance(
      month,
      year,
      technicianIds,
    );

    return NextResponse.json({
      success: true,
      data: {
        records: result.records,
        summary: result.summary,
      },
    });
  } catch (error: unknown) {
    console.error('GET /technicians/attendance error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching attendance'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
