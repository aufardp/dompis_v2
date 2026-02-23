import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { AttendanceCheckInInput } from '@/app/types/attendance';
import prisma from '@/app/libs/prisma';

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
    const currentUserId = decoded.id_user;

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

    const currentUserServiceAreas = await prisma.user_sa.findMany({
      where: { user_id: currentUserId },
      select: { sa_id: true },
    });

    const currentUserSaIds: number[] = currentUserServiceAreas
      .map((usa) => usa.sa_id)
      .filter((id): id is number => id !== null && id !== undefined);

    let technicianIds: number[] | undefined;

    if (technicianId) {
      technicianIds = [technicianId];
    } else if (currentUserSaIds.length > 0) {
      const techniciansInSameArea = await prisma.user_sa.findMany({
        where: { sa_id: { in: currentUserSaIds } },
        select: { user_id: true },
      });

      technicianIds = Array.from(
        new Set(
          techniciansInSameArea
            .map((usa) => usa.user_id)
            .filter((id): id is number => id !== null && id !== undefined),
        ),
      );
    }

    if (!technicianId && (!technicianIds || technicianIds.length === 0)) {
      return NextResponse.json({
        success: true,
        data: {
          records: [],
          summary: {
            total_present: 0,
            total_late: 0,
            total_absent: 0,
            working_days: AttendanceService.getWorkingDaysInMonth(month, year),
          },
        },
      });
    }

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
