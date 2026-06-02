import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { AttendanceCheckInInput } from '@/app/types/attendance';
import prisma from '@/app/libs/prisma';
import { signAccessToken } from '@/app/libs/auth';
import { getSecureCookieOptions } from '@/app/libs/request-security';
import { logger } from '@/lib/observability/logger';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const decoded = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
    ]);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'attendance-checkin',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const technicianId = decoded.id_user;

    const attendanceSchema = z.object({
      workzone_id: z.number(),
    });

    const body = await request.json();
    const parsed = attendanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { workzone_id } = parsed.data;

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

    // ─── Refresh JWT token after successful check-in ───────────────
    // Update attendance claims so middleware reads fresh data immediately.
    const today = AttendanceService.getTodayDateString();
    const newAccessToken = await signAccessToken({
      id_user: decoded.id_user,
      role: decoded.role,
      role_id: decoded.role_id,
      workzone: decoded.workzone,
      attendance_checked_in: true,
      attendance_date: today,
      attendance_status: result.status ?? null,
      attendance_check_in_at: result.check_in_at ?? null,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        check_in_at: result.check_in_at,
        status: result.status,
      },
    });

    // Set the refreshed access token cookie
    response.cookies.set({
      name: 'token',
      value: newAccessToken,
      ...getSecureCookieOptions(60 * 60),
    });

    return response;
  } catch (error: unknown) {
    logger.error('POST /technicians/attendance error:', error);
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
      .map((usa: { sa_id: number | null }) => usa.sa_id)
      .filter((id: number | null | undefined): id is number => id !== null && id !== undefined);

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
            .map((usa: { user_id: number | null }) => usa.user_id)
            .filter((id: number | null | undefined): id is number => id !== null && id !== undefined),
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
    logger.error('GET /technicians/attendance error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching attendance'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
