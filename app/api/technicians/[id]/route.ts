import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { differenceInMinutes } from 'date-fns';
import { AttendanceService } from '@/app/libs/services/attendance.service';

export const dynamic = 'force-dynamic';

function parseDateInput(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    if (dateStr.includes('/')) {
      const [day, month, yearAndTime] = dateStr.split('/');
      const [year, time] = yearAndTime.split(' ');
      const [hour, minute] = time ? time.split(':') : ['0', '0'];
      const parsed = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
      );
      if (!isNaN(parsed.getTime())) return parsed;
    }
    const standard = new Date(dateStr);
    if (!isNaN(standard.getTime())) return standard;
    return null;
  } catch {
    return null;
  }
}

function calculateAge(dateStr: string | null | undefined): {
  age: string;
  hours: number;
} {
  if (!dateStr) return { age: '-', hours: 0 };

  const start = parseDateInput(dateStr);
  if (!start) return { age: '-', hours: 0 };

  const end = new Date();
  const totalMinutes = differenceInMinutes(end, start);
  if (totalMinutes < 0) return { age: '0m', hours: 0 };

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return { age: parts.join(' '), hours: totalMinutes / 60 };
}

function getTechnicianStatus(
  ticketCount: number,
): 'IDLE' | 'AKTIF' | 'OVERLOAD' {
  if (ticketCount === 0) return 'IDLE';
  if (ticketCount > 3) return 'OVERLOAD';
  return 'AKTIF';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);
    const currentUserId = decoded.id_user;

    const { id } = await context.params;
    const techId = Number(id);

    if (isNaN(techId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid technician ID' },
        { status: 400 },
      );
    }

    const currentUserServiceAreas = await prisma.user_sa.findMany({
      where: { user_id: currentUserId },
      select: { sa_id: true },
    });

    const currentUserSaIds: number[] = [];
    for (const usa of currentUserServiceAreas) {
      if (usa.sa_id !== null && usa.sa_id !== undefined) {
        currentUserSaIds.push(usa.sa_id);
      }
    }

    if (currentUserSaIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Access denied - No service area assigned' },
        { status: 403 },
      );
    }

    const technicianServiceAreas = await prisma.user_sa.findMany({
      where: { user_id: techId },
      select: { sa_id: true },
    });

    const technicianSaIds: number[] = [];
    for (const usa of technicianServiceAreas) {
      if (usa.sa_id !== null && usa.sa_id !== undefined) {
        technicianSaIds.push(usa.sa_id);
      }
    }

    const hasAccess = technicianSaIds.some((saId) =>
      currentUserSaIds.includes(saId),
    );

    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          message: 'Access denied - Technician not in your service area',
        },
        { status: 403 },
      );
    }

    const technician = await prisma.users.findUnique({
      where: { id_user: techId },
      select: {
        id_user: true,
        nama: true,
        nik: true,
      },
    });

    if (!technician) {
      return NextResponse.json(
        { success: false, message: 'Technician not found' },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const includeAbsent = searchParams.get('include_absent') === 'true';

    if (!includeAbsent) {
      const presentIds = await AttendanceService.getTodayPresentTechnicianIds();
      if (!presentIds.includes(techId)) {
        return NextResponse.json(
          {
            success: false,
            message: 'Teknisi belum absen hari ini',
          },
          { status: 403 },
        );
      }
    }

    const userServiceAreas = await prisma.user_sa.findMany({
      where: { user_id: techId },
      include: { service_area: { select: { nama_sa: true } } },
    });

    const workzoneNames = userServiceAreas
      .map((usa) => usa.service_area?.nama_sa)
      .filter((name): name is string => name !== null && name !== undefined);
    const workzone =
      workzoneNames.length > 0 ? workzoneNames.join(', ') : 'Unknown';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const assignedTickets = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: techId,
        HASIL_VISIT: { not: 'CLOSE' },
      },
      select: {
        id_ticket: true,
        INCIDENT: true,
        CONTACT_NAME: true,
        CUSTOMER_TYPE: true,
        SERVICE_NO: true,
        REPORTED_DATE: true,
        HASIL_VISIT: true,
      },
      orderBy: { REPORTED_DATE: 'asc' },
    });

    const closedToday = await prisma.ticket.count({
      where: {
        teknisi_user_id: techId,
        HASIL_VISIT: 'CLOSE',
        closed_at: {
          gte: today,
          lte: todayEnd,
        },
      },
    });

    const mappedTickets = assignedTickets.map((t) => {
      const { age, hours } = calculateAge(t.REPORTED_DATE);
      return {
        idTicket: t.id_ticket,
        ticket: t.INCIDENT,
        contactName: t.CONTACT_NAME,
        ctype: t.CUSTOMER_TYPE,
        serviceNo: t.SERVICE_NO,
        reportedDate: t.REPORTED_DATE,
        hasilVisit: t.HASIL_VISIT,
        age,
        ageHours: hours,
      };
    });

    const assignedCount = assignedTickets.filter(
      (t) => t.HASIL_VISIT === 'ASSIGNED',
    ).length;
    const onProgressCount = assignedTickets.filter(
      (t) => t.HASIL_VISIT === 'ON_PROGRESS',
    ).length;
    const pendingCount = assignedTickets.filter(
      (t) => t.HASIL_VISIT === 'PENDING',
    ).length;

    const totalClosed = await prisma.ticket.count({
      where: {
        teknisi_user_id: techId,
        HASIL_VISIT: 'CLOSE',
      },
    });

    const closedTickets = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: techId,
        HASIL_VISIT: 'CLOSE',
        closed_at: { not: undefined },
      },
      select: {
        REPORTED_DATE: true,
        closed_at: true,
      },
      take: 10,
    });

    let avgResolveHours: number | null = null;
    if (closedTickets.length > 0) {
      const totalResolveMinutes = closedTickets.reduce((acc, t) => {
        if (!t.REPORTED_DATE || !t.closed_at) return acc;
        const start = parseDateInput(t.REPORTED_DATE);
        const end = new Date(t.closed_at);
        if (!start || isNaN(start.getTime()) || isNaN(end.getTime()))
          return acc;
        return acc + (end.getTime() - start.getTime()) / (1000 * 60);
      }, 0);
      avgResolveHours = totalResolveMinutes / closedTickets.length / 60;
    }

    return NextResponse.json({
      success: true,
      data: {
        id_user: technician.id_user,
        nama: technician.nama,
        nik: technician.nik,
        workzone: workzone,
        avatar_url: null,
        assigned_tickets: mappedTickets,
        total_assigned: mappedTickets.length,
        total_closed_today: closedToday,
        total_closed_all: totalClosed,
        average_resolve_time_hours: avgResolveHours,
        status: getTechnicianStatus(mappedTickets.length),
        order_counts: {
          assigned: assignedCount,
          on_progress: onProgressCount,
          pending: pendingCount,
          closed: totalClosed,
        },
      },
    });
  } catch (error: unknown) {
    console.error('GET /technicians/[id] error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching technician'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
