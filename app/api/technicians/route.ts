import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { differenceInMinutes } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { getCache, setCache } from '@/lib/cache';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { logger } from '@/lib/observability/logger';
import {
  classifyTechnicianBucket,
  getTechnicianBucketLabel,
} from '@/app/libs/technician-bucket';
import { resolveBranchScope } from '@/app/helpers/ticket.helpers';

export const dynamic = 'force-dynamic';

const TECHNICIANS_CACHE_TTL = 60;

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
      if (!isNaN(parsed.getTime())) return parsed;
    }
    const standard = new Date(str);
    if (!isNaN(standard.getTime())) return standard;
    return null;
  } catch {
    return null;
  }
}

function calculateAge(dateStr: string | Date | null | undefined): {
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
  incident: string;
  contact_name: string | null;
  customer_type: string | null;
  service_no: string | null;
  reported_date: string | null;
  status_update: string | null;
  workzone?: string | null;
  source_ticket?: string | null;
  classification_flag?: string | null;
  classification_path?: string | null;
  channel?: string | null;
  summary?: string | null;
  jenis_tiket_1?: string | null;
  jenis_tiket_2?: string | null;
}) {
  const { age, hours } = calculateAge(t.reported_date);
  const bucket = classifyTechnicianBucket(t);
  return {
    idTicket: t.id_ticket,
    ticket: t.incident,
    contactName: t.contact_name,
    ctype: t.customer_type,
    serviceNo: t.service_no,
    reportedDate: t.reported_date,
    statusUpdate: t.status_update,
    workzone: t.workzone ?? null,
    age,
    ageHours: hours,
    operationalBucket: bucket,
    operationalBucketLabel: getTechnicianBucketLabel(bucket),
    jenisTiket1: t.jenis_tiket_1 ?? null,
    jenisTiket: t.jenis_tiket_2 ?? undefined,
  };
}

const technicianTicketSelect = {
  id_ticket: true,
  incident: true,
  contact_name: true,
  customer_type: true,
  service_no: true,
  reported_date: true,
  status_update: true,
  teknisi_user_id: true,
  closed_at: true,
  workzone: true,
  source_ticket: true,
  classification_flag: true,
  classification_path: true,
  channel: true,
  summary: true,
  jenis_tiket_1: true,
  jenis_tiket_2: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);
    const currentUserId = decoded.id_user;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const workzone = searchParams.get('workzone') || undefined;
    const status = searchParams.get('status') || 'all';
    const branchParam = searchParams.get('branch');
    const branchSas = await resolveBranchScope(
      decoded.role,
      currentUserId,
      branchParam,
    );
    const includeAbsent = searchParams.get('include_absent') === 'true';
    const includeClosedToday =
      searchParams.get('include_closed_today') === 'true';
    const closedTodayLimitRaw = searchParams.get('closed_today_limit');
    const closedTodayLimit = Math.max(
      0,
      Math.min(10, Number(closedTodayLimitRaw || 3) || 3),
    );

    const cacheKey = `technicians:v2:${currentUserId}:${search || 'none'}:${workzone || 'none'}:${branchSas?.join(',') || 'none'}:${status}:${includeAbsent}:${includeClosedToday}:${closedTodayLimit}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const [currentUserServiceAreas, presentTechnicianIds] = await Promise.all([
      prisma.user_sa.findMany({
        take: 100,
        where: { user_id: currentUserId },
        include: { service_area: { select: { id_sa: true, nama_sa: true } } },
      }),
      !includeAbsent ? AttendanceService.getTodayPresentTechnicianIds() : Promise.resolve([] as number[]),
    ]);

    if (branchSas && branchSas.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          technicians: [],
          summary: { total_active: 0, total_assigned: 0, overload_count: 0, idle_count: 0 },
          userWorkzones: [],
        },
      });
    }

    const branchSaNames = branchSas ? new Set(branchSas) : null;
    const currentUserSaIds: number[] = [];
    const currentUserWorkzoneNames: string[] = [];

    for (const usa of currentUserServiceAreas) {
      const namaSa = usa.service_area?.nama_sa;
      if (branchSaNames && (!namaSa || !branchSaNames.has(namaSa))) {
        continue;
      }
      if (usa.sa_id !== null && usa.sa_id !== undefined) {
        currentUserSaIds.push(usa.sa_id);
      }
      if (namaSa) {
        currentUserWorkzoneNames.push(namaSa);
      }
    }

    if (currentUserSaIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          technicians: [],
          summary: { total_active: 0, total_assigned: 0, overload_count: 0, idle_count: 0 },
          userWorkzones: [],
        },
      });
    }

      const uniqueTechnicianIds = [
        ...new Set(
          (
            await prisma.user_sa.findMany({
              take: 1000,
              where: { sa_id: { in: currentUserSaIds } },
              select: { user_id: true },
            })
          )
            .map((usa) => usa.user_id)
            .filter((id): id is number => id !== null && id !== undefined),
        ),
      ];

    const technicianRoleId = 4;

    const todayStr = AttendanceService.getTodayDateString();
    const WIB = 'Asia/Jakarta';
    const today = fromZonedTime(`${todayStr}T00:00:00`, WIB);
    const todayEnd = fromZonedTime(`${todayStr}T23:59:59`, WIB);

    const technicianWhere: Record<string, unknown> = {
      role_id: technicianRoleId,
      id_user: { in: uniqueTechnicianIds },
    };

    if (search) {
      technicianWhere.OR = [
        { nama: { startsWith: search } },
        { nik: { startsWith: search } },
      ];
    }

    const [
      technicians,
      userServiceAreas,
      clusterAssignments,
      pendingTickets,
      todayAssignedTickets,
      closedTicketsToday,
      closedToday,
    ] = await Promise.all([
      prisma.users.findMany({
        take: 1000,
        where: technicianWhere,
        select: { id_user: true, nama: true, nik: true },
        orderBy: { nama: 'asc' },
      }),
      prisma.user_sa.findMany({
        take: 1000,
        where: { user_id: { in: uniqueTechnicianIds } },
        include: { service_area: { select: { id_sa: true, nama_sa: true } } },
      }),
      prisma.cluster_assignment.findMany({
        take: 1000,
        where: { teknisi_id: { in: uniqueTechnicianIds }, assigned_date: todayStr, is_active: true },
        include: { cluster: { select: { nama_cluster: true } } },
      }),
      prisma.ticket.findMany({
        where: { teknisi_user_id: { in: uniqueTechnicianIds }, status_update: 'pending' },
        select: technicianTicketSelect,
        orderBy: { reported_date: 'asc' },
        take: 500,
      }),
      prisma.ticket.findMany({
        where: {
          teknisi_user_id: { in: uniqueTechnicianIds },
          status_update: { in: ['assigned', 'on_progress'] },
          ticket_assignment_history: {
            some: { assigned_at: { gte: today, lte: todayEnd }, is_active: true },
          },
        },
        select: technicianTicketSelect,
        orderBy: { reported_date: 'asc' },
        take: 500,
      }),
      includeClosedToday
        ? prisma.ticket.findMany({
            where: {
              teknisi_user_id: { in: uniqueTechnicianIds },
              status_update: { in: ['close', 'closed'] },
              closed_at: { gte: today, lte: todayEnd },
            },
            select: {
              ...technicianTicketSelect,
            },
            orderBy: { closed_at: 'desc' },
            take: closedTodayLimit,
          })
        : Promise.resolve([]),
      prisma.ticket.groupBy({
        by: ['teknisi_user_id'],
        where: {
          teknisi_user_id: { in: uniqueTechnicianIds },
          status_update: { in: ['close', 'closed', 'CLOSE', 'CLOSED'] },
          closed_at: { gte: today, lte: todayEnd },
        },
        _count: true,
      }),
    ]);

    const filteredTechnicians = includeAbsent
      ? technicians
      : technicians.filter((tech: { id_user: number }) =>
          presentTechnicianIds.includes(tech.id_user),
        );

    const techWorkzones = new Map<number, string[]>();
    for (const usa of userServiceAreas) {
      if (usa.user_id && usa.service_area?.nama_sa) {
        const existing = techWorkzones.get(usa.user_id) || [];
        existing.push(usa.service_area.nama_sa);
        techWorkzones.set(usa.user_id, existing);
      }
    }

    const clusterMap = new Map<number, string[]>();
    for (const ca of clusterAssignments) {
      const existing = clusterMap.get(ca.teknisi_id) || [];
      existing.push(ca.cluster.nama_cluster);
      clusterMap.set(ca.teknisi_id, existing);
    }

    const closedTodayMap = new Map<number, number>();
    for (const c of closedToday) {
      if (c.teknisi_user_id) {
        closedTodayMap.set(c.teknisi_user_id, c._count);
      }
    }

    const ticketsByTech = new Map<number, typeof pendingTickets>();

    for (const ticket of pendingTickets) {
      if (ticket.teknisi_user_id) {
        const existing = ticketsByTech.get(ticket.teknisi_user_id) || [];
        existing.push(ticket);
        ticketsByTech.set(ticket.teknisi_user_id, existing);
      }
    }

    for (const ticket of todayAssignedTickets) {
      if (ticket.teknisi_user_id) {
        const existing = ticketsByTech.get(ticket.teknisi_user_id) || [];
        const existingIds = new Set(existing.map(e => e.id_ticket));
        if (!existingIds.has(ticket.id_ticket)) {
          existing.push(ticket);
          ticketsByTech.set(ticket.teknisi_user_id, existing);
        }
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
      .map((tech: { id_user: number; nama: any; nik: any }) => {
        const tickets = ticketsByTech.get(tech.id_user) || [];

        const pendingList = tickets.filter(
          (t: { status_update: string | null | undefined }) => t.status_update === 'pending',
        );
        const assignedList = tickets.filter(
          (t: { status_update: string | null | undefined }) => t.status_update === 'assigned',
        );
        const onProgressList = tickets.filter(
          (t: { status_update: string | null | undefined }) => t.status_update === 'on_progress',
        );

        const mappedTickets = tickets.map(mapTechnicianTicket);
        const ticketCount = mappedTickets.length;
        const techStatus = getTechnicianStatus(ticketCount);

        const mappedClosedToday = includeClosedToday
          ? (closedTodayByTech.get(tech.id_user) || []).map((t: any) => {
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
          workzoneName.toLowerCase().trim() !== workzone.toLowerCase().trim()
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
          cluster_today: clusterMap.get(tech.id_user) || [],
          avatar_url: null,
          assigned_tickets: mappedTickets,
          ...(includeClosedToday
            ? { closed_tickets_today: mappedClosedToday }
            : {}),
          total_assigned: ticketCount,
          total_closed_today: closedTodayMap.get(tech.id_user) || 0,
          average_resolve_time_hours: null,
          order_counts: {
            assigned: assignedList.length,
            on_progress: onProgressList.length,
            pending: pendingList.length,
            closed: closedTodayMap.get(tech.id_user) || 0,
          },
        };
      })
      .filter((t: unknown): t is NonNullable<typeof t> => t !== null);

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

    return NextResponse.json(
      { success: true, data: responseData },
      { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } },
    );
  } catch (error: unknown) {
    logger.error('GET /technicians error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching technicians'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
