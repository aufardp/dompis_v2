import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { differenceInMinutes } from 'date-fns';
import { AttendanceService } from '@/app/libs/services/attendance.service';

export const dynamic = 'force-dynamic';

interface TicketType {
  id_ticket: number;
  incident: string;
  contact_name: string | null;
  customer_type: string | null;
  service_no: string | null;
  reported_date: Date | string | null;
  status_update: string | null;
  closed_at: Date | string | null;
}

/**
 * Helper: Konversi format dd/mm/yyyy hh:mm atau ISO ke Date object
 */
function parseDateInput(
  dateStr: string | Date | null | undefined,
): Date | null {
  if (!dateStr) return null;
  try {
    const str = typeof dateStr === 'string' ? dateStr : dateStr.toISOString();
    if (str.includes('/')) {
      const [day, month, yearAndTime] = str.split('/');
      const [year, time] = yearAndTime.split(' ');
      const [hour, minute] = time ? time.split(':') : ['0', '0'];
      const parsed = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
      );
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    const standard = new Date(str);
    return isNaN(standard.getTime()) ? null : standard;
  } catch {
    return null;
  }
}

function calculateAge(dateStr: string | Date | null | undefined) {
  if (!dateStr) return { age: '-', hours: 0 };
  const start = parseDateInput(dateStr);
  if (!start) return { age: '-', hours: 0 };

  const totalMinutes = differenceInMinutes(new Date(), start);
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
  return ticketCount > 3 ? 'OVERLOAD' : 'AKTIF';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Auth & Initial Validation
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);
    const { id } = await context.params;
    const techId = Number(id);

    if (isNaN(techId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid ID' },
        { status: 400 },
      );
    }

    // 2. Optimized Fetch: Ambil Data Admin & Teknisi sekaligus untuk efisiensi
    const [currentUser, technician] = await Promise.all([
      prisma.users.findUnique({
        where: { id_user: decoded.id_user },
        select: { user_sa: { select: { sa_id: true } } },
      }),
      prisma.users.findUnique({
        where: { id_user: techId },
        select: {
          id_user: true,
          nama: true,
          nik: true,
          user_sa: { include: { service_area: { select: { nama_sa: true } } } },
        },
      }),
    ]);

    if (!technician) {
      return NextResponse.json(
        { success: false, message: 'Technician not found' },
        { status: 404 },
      );
    }

    // 3. Service Area Access Control
    const adminSaIds =
      currentUser?.user_sa.map((sa: { sa_id: number | null }) => sa.sa_id).filter((id: number | null): id is number => id !== null) ||
      [];
    const techSaIds =
      technician.user_sa.map((sa: { sa_id: number | null }) => sa.sa_id).filter((id: number | null): id is number => id !== null) ||
      [];

    if (
      adminSaIds.length === 0 ||
      !techSaIds.some((id: number) => adminSaIds.includes(id))
    ) {
      return NextResponse.json(
        { success: false, message: 'Access denied' },
        { status: 403 },
      );
    }

    // 4. Attendance Check
    const { searchParams } = new URL(request.url);
    if (searchParams.get('include_absent') !== 'true') {
      const presentIds = await AttendanceService.getTodayPresentTechnicianIds();
      if (!presentIds.includes(techId)) {
        return NextResponse.json(
          { success: false, message: 'Teknisi belum absen hari ini' },
          { status: 403 },
        );
      }
    }

    // 5. Workzone String Construction
    const workzone =
      technician.user_sa
        .flatMap(
          (
            usa: { service_area: { nama_sa: string | null } | null },
          ) =>
            usa.service_area?.nama_sa ? [usa.service_area.nama_sa] : [],
        )
        .join(', ') || 'Unknown';

    // 6. Ticket Data Processing
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const [assignedTickets, closedToday, totalClosedAll, recentClosed] =
      await Promise.all([
        prisma.ticket.findMany({
          where: {
            teknisi_user_id: techId,
            OR: [{ status_update: null }, { status_update: { not: 'closed' } }],
          },
          orderBy: { reported_date: 'asc' },
        }),
        prisma.ticket.count({
          where: {
            teknisi_user_id: techId,
            status_update: 'CLOSE',
            closed_at: { gte: today, lte: todayEnd },
          },
        }),
        prisma.ticket.count({
          where: { teknisi_user_id: techId, status_update: 'CLOSE' },
        }),
        prisma.ticket.findMany({
          where: {
            teknisi_user_id: techId,
            status_update: { in: ['close', 'closed', 'CLOSE', 'CLOSED'] },
            closed_at: { not: null },
          },
          select: { reported_date: true, closed_at: true },
          take: 10,
        }),
      ]);

    const mappedTickets = assignedTickets.map((t: TicketType) => ({
      ...calculateAge(t.reported_date),
      idTicket: t.id_ticket,
      ticket: t.incident,
      contactName: t.contact_name,
      ctype: t.customer_type,
      serviceNo: t.service_no,
      reportedDate: t.reported_date,
      status_update: t.status_update,
    }));

    // 7. Performance Calculation
    let avgResolveHours: number | null = null;
    if (recentClosed.length > 0) {
      const totalMinutes = recentClosed.reduce(
        (acc: number, t: { reported_date: Date | string | null; closed_at: Date | string | null }) => {
          const start = parseDateInput(t.reported_date);
          const end = t.closed_at ? new Date(t.closed_at) : null;
          if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()))
            return acc;
          return acc + (end.getTime() - start.getTime()) / 60000;
        },
        0,
      );
      avgResolveHours = totalMinutes / recentClosed.length / 60;
    }

    return NextResponse.json({
      success: true,
      data: {
        id_user: technician.id_user,
        nama: technician.nama,
        nik: technician.nik,
        workzone,
        assigned_tickets: mappedTickets,
        total_assigned: mappedTickets.length,
        total_closed_today: closedToday,
        total_closed_all: totalClosedAll,
        average_resolve_time_hours: avgResolveHours,
        status: getTechnicianStatus(mappedTickets.length),
        order_counts: {
          assigned: assignedTickets.filter(
            (t: TicketType) => t.status_update === 'ASSIGNED',
          ).length,
          on_progress: assignedTickets.filter(
            (t: TicketType) => t.status_update === 'ON_PROGRESS',
          ).length,
          pending: assignedTickets.filter((t: TicketType) => t.status_update === 'PENDING')
            .length,
          closed: totalClosedAll,
        },
      },
    });
  } catch (error) {
    console.error('GET Technician Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Internal Server Error'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
