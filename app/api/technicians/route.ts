import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { differenceInMinutes } from 'date-fns';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const TECHNICIANS_CACHE_TTL = 300;

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

function mapTechnicianTicket(t: {
  id_ticket: number;
  INCIDENT: string;
  CONTACT_NAME: string | null;
  CUSTOMER_TYPE: string | null;
  SERVICE_NO: string | null;
  REPORTED_DATE: string | null;
  STATUS_UPDATE: string | null;
}) {
  const { age, hours } = calculateAge(t.REPORTED_DATE);
  return {
    idTicket: t.id_ticket,
    ticket: t.INCIDENT,
    contactName: t.CONTACT_NAME,
    ctype: t.CUSTOMER_TYPE,
    serviceNo: t.SERVICE_NO,
    reportedDate: t.REPORTED_DATE,
    STATUS_UPDATE: t.STATUS_UPDATE,
    age,
    ageHours: hours,
  };
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);
    const currentUserId = decoded.id_user;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const workzone = searchParams.get('workzone') || undefined;
    const status = searchParams.get('status') || 'all';
    const includeAbsent = searchParams.get('include_absent') === 'true';
    const includeClosedToday =
      searchParams.get('include_closed_today') === 'true';
    const closedTodayLimitRaw = searchParams.get('closed_today_limit');
    const closedTodayLimit = Math.max(
      0,
      Math.min(10, Number(closedTodayLimitRaw || 3) || 3),
    );

    const cacheKey = `technicians:${currentUserId}:${search || 'none'}:${workzone || 'none'}:${status}:${includeAbsent}:${includeClosedToday}:${closedTodayLimit}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const currentUserServiceAreas = await prisma.user_sa.findMany({
      where: { user_id: currentUserId },
      include: { service_area: { select: { id_sa: true, nama_sa: true } } },
    });

    const currentUserSaIds: number[] = [];
    const currentUserWorkzoneNames: string[] = [];

    for (const usa of currentUserServiceAreas) {
      if (usa.sa_id !== null && usa.sa_id !== undefined) {
        currentUserSaIds.push(usa.sa_id);
      }
      if (usa.service_area?.nama_sa) {
        currentUserWorkzoneNames.push(usa.service_area.nama_sa);
      }
    }

    if (currentUserSaIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          technicians: [],
          summary: {
            total_active: 0,
            total_assigned: 0,
            overload_count: 0,
            idle_count: 0,
          },
          userWorkzones: [],
        },
      });
    }

    const techniciansInSameArea = await prisma.user_sa.findMany({
      where: { sa_id: { in: currentUserSaIds } },
      select: { user_id: true },
    });

    const technicianUserIds: number[] = [];
    for (const usa of techniciansInSameArea) {
      if (usa.user_id !== null && usa.user_id !== undefined) {
        technicianUserIds.push(usa.user_id);
      }
    }

    const uniqueTechnicianIds = [...new Set(technicianUserIds)];

    const technicianRoleId = 4;

    const technicianWhere: Record<string, unknown> = {
      role_id: technicianRoleId,
      id_user: { in: uniqueTechnicianIds },
    };

    if (search) {
      technicianWhere.OR = [
        { nama: { contains: search } },
        { nik: { contains: search } },
      ];
    }

    const technicians = await prisma.users.findMany({
      where: technicianWhere,
      select: {
        id_user: true,
        nama: true,
        nik: true,
      },
      orderBy: { nama: 'asc' },
    });

    let presentTechnicianIds: number[] = [];
    if (!includeAbsent) {
      presentTechnicianIds =
        await AttendanceService.getTodayPresentTechnicianIds();
    }

    const filteredTechnicians = includeAbsent
      ? technicians
      : technicians.filter((tech) =>
          presentTechnicianIds.includes(tech.id_user),
        );

    const userServiceAreas = await prisma.user_sa.findMany({
      where: { user_id: { in: uniqueTechnicianIds } },
      include: { service_area: { select: { id_sa: true, nama_sa: true } } },
    });

    const techWorkzones = new Map<number, string[]>();
    for (const usa of userServiceAreas) {
      if (usa.user_id && usa.service_area?.nama_sa) {
        const existing = techWorkzones.get(usa.user_id) || [];
        existing.push(usa.service_area.nama_sa);
        techWorkzones.set(usa.user_id, existing);
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const assignedTickets = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: { in: uniqueTechnicianIds },
      },
      select: {
        id_ticket: true,
        INCIDENT: true,
        CONTACT_NAME: true,
        CUSTOMER_TYPE: true,
        SERVICE_NO: true,
        REPORTED_DATE: true,
        STATUS_UPDATE: true,
        teknisi_user_id: true,
        closed_at: true,
      },
      orderBy: { REPORTED_DATE: 'asc' },
    });

    const closedTicketsToday = includeClosedToday
      ? await prisma.ticket.findMany({
          where: {
            teknisi_user_id: { in: uniqueTechnicianIds },
            STATUS_UPDATE: 'closed',
            closed_at: {
              gte: today,
              lte: todayEnd,
            },
          },
          select: {
            id_ticket: true,
            INCIDENT: true,
            CONTACT_NAME: true,
            CUSTOMER_TYPE: true,
            SERVICE_NO: true,
            REPORTED_DATE: true,
            STATUS_UPDATE: true,
            teknisi_user_id: true,
            closed_at: true,
          },
          orderBy: { closed_at: 'desc' },
        })
      : [];

    const closedToday = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: {
        teknisi_user_id: { in: uniqueTechnicianIds },
        STATUS_UPDATE: { in: ['close', 'closed', 'CLOSE', 'CLOSED'] },
        closed_at: {
          gte: today,
          lte: todayEnd,
        },
      },
      _count: true,
    });

    const closedTodayMap = new Map<number, number>();
    for (const c of closedToday) {
      if (c.teknisi_user_id) {
        closedTodayMap.set(c.teknisi_user_id, c._count);
      }
    }

    const ticketsByTech = new Map<number, typeof assignedTickets>();
    for (const ticket of assignedTickets) {
      if (ticket.teknisi_user_id) {
        const existing = ticketsByTech.get(ticket.teknisi_user_id) || [];
        existing.push(ticket);
        ticketsByTech.set(ticket.teknisi_user_id, existing);
      }
    }

    const closedTodayByTech = new Map<number, typeof closedTicketsToday>();
    if (includeClosedToday) {
      for (const t of closedTicketsToday) {
        if (!t.teknisi_user_id) continue;
        const existing = closedTodayByTech.get(t.teknisi_user_id) || [];
        if (existing.length >= closedTodayLimit) continue;
        existing.push(t);
        closedTodayByTech.set(t.teknisi_user_id, existing);
      }
    }

    let totalActive = 0;
    let totalAssigned = 0;
    let overloadCount = 0;
    let idleCount = 0;

    const mappedTechnicians = filteredTechnicians
      .map((tech) => {
        const tickets = ticketsByTech.get(tech.id_user) || [];

        const assignedTickets = tickets.filter(
          (t) => t.STATUS_UPDATE === 'ASSIGNED',
        );
        const onProgressTickets = tickets.filter(
          (t) => t.STATUS_UPDATE === 'ON_PROGRESS',
        );
        const pendingTickets = tickets.filter(
          (t) => t.STATUS_UPDATE === 'PENDING',
        );
        const closedTickets = tickets.filter(
          (t) => t.STATUS_UPDATE === 'CLOSE',
        );
        const activeTickets = tickets.filter(
          (t) => t.STATUS_UPDATE !== 'CLOSE',
        );
        const mappedTickets = activeTickets.map(mapTechnicianTicket);
        const ticketCount = mappedTickets.length;
        const techStatus = getTechnicianStatus(ticketCount);

        const mappedClosedToday = includeClosedToday
          ? (closedTodayByTech.get(tech.id_user) || []).map((t) => {
              const base = mapTechnicianTicket(t as any);
              return {
                ...base,
                closedAt: (t as any).closed_at
                  ? new Date((t as any).closed_at).toISOString()
                  : null,
              };
            })
          : undefined;

        const workzoneNames = techWorkzones.get(tech.id_user) || [];
        const workzoneName =
          workzoneNames.length > 0 ? workzoneNames.join(', ') : 'Unknown';

        if (status !== 'all' && techStatus !== status) {
          return null;
        }

        if (
          workzone &&
          !workzoneName.toLowerCase().includes(workzone.toLowerCase())
        ) {
          return null;
        }

        if (techStatus === 'IDLE') idleCount++;
        if (techStatus === 'OVERLOAD') overloadCount++;
        if (techStatus !== 'IDLE') totalActive++;
        totalAssigned += ticketCount;

        return {
          id_user: tech.id_user,
          nama: tech.nama,
          nik: tech.nik,
          workzone: workzoneName,
          avatar_url: null,
          assigned_tickets: mappedTickets,
          ...(includeClosedToday
            ? { closed_tickets_today: mappedClosedToday }
            : {}),
          total_assigned: ticketCount,
          total_closed_today: closedTodayMap.get(tech.id_user) || 0,
          average_resolve_time_hours: null,
          order_counts: {
            assigned: assignedTickets.length,
            on_progress: onProgressTickets.length,
            pending: pendingTickets.length,
            closed: closedTickets.length,
          },
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const responseData = {
      technicians: mappedTechnicians,
      summary: {
        total_active: totalActive,
        total_assigned: totalAssigned,
        overload_count: overloadCount,
        idle_count: idleCount,
      },
      userWorkzones: currentUserWorkzoneNames,
    };

    await setCache(cacheKey, responseData, TECHNICIANS_CACHE_TTL);

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error: unknown) {
    console.error('GET /technicians error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching technicians'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
