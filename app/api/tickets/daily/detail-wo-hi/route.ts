import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { parseSearchType } from '@/lib/search-intent';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { getOrSetCache } from '@/lib/cache';
import { getEffectiveMaxTtrLabel } from '@/app/libs/tickets/effective';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 30;

function buildCacheKey(
  role: string,
  userId: number,
  params: URLSearchParams,
): string | null {
  const filterParams = new URLSearchParams(params);
  if (filterParams.has('_t')) return null;
  filterParams.sort();
  return `tickets_daily_detail_wo_hi:${role}:${userId}:${filterParams.toString()}`;
}

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function computeAge(reportedDate: string | null | undefined): string {
  if (!reportedDate) return '';
  try {
    const d = new Date(reportedDate);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    if (diffDays > 0) return `${diffDays}d ${remainingHours}h`;
    return `${diffHours}h`;
  } catch { return ''; }
}

function getMaxTtr(ticket: Record<string, any>): string {
  const label = getEffectiveMaxTtrLabel({
    reportedDate: ticket.reported_date,
    bookingDate: ticket.booking_date,
    guaranteeStatus: ticket.guarantee_status,
    flaggingManja: ticket.flagging_manja,
    customerType: ticket.customer_type,
    ctype: ticket.customer_type,
    maxTtrGold: ticket.status_ttr_12_gold,
    maxTtrDiamond: ticket.status_ttr_3_diamond,
    maxTtrPlatinum: ticket.status_ttr_6_platinum,
    maxTtrReguler: ticket.status_ttr_24_reguler,
  });
  return label ?? '';
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch { return ''; }
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch { return ''; }
}

export async function GET(request: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin', 'super_admin']);
    const { searchParams } = new URL(request.url);

    const rawDept = searchParams.get('dept') ?? 'all';
    const dept = rawDept === 'neutral' ? 'netral' : rawDept;
    const search = searchParams.get('search') ?? '';
    const searchType = parseSearchType(searchParams.get('searchType'));
    const workzone = searchParams.get('workzone') ?? '';
    const branchParam = searchParams.get('branch') ?? '';
    const ctype = searchParams.get('ctype') ?? '';
    const status = searchParams.get('status') ?? 'all';
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';
    const page = toInt(searchParams.get('page'), 1);
    const limit = Math.min(toInt(searchParams.get('limit'), 100), 100);
    const branchId = branchParam ? Number(branchParam) : undefined;
    const cacheKey = buildCacheKey(user.role, user.id_user, searchParams);

    const result = await getOrSetCache(cacheKey || `tickets_daily_detail_wo_hi:${user.role}:${user.id_user}:uncached`, async () => {
    const baseWhere = await DailyTicketService.buildDetailWoHiWhere(
      user.role, user.id_user, {
        dept: dept === 'all' ? undefined : dept as 'b2b' | 'b2c' | 'netral',
        search: search || undefined,
        searchType,
        workzone: workzone || undefined,
        branchId,
        ctype: ctype || undefined,
        statusUpdate: status === 'assigned' ? 'assigned' : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        includeClosed: true,
      },
    );
    const mainWhere = DailyTicketService.buildMainTableWhere(baseWhere, {
      includeClosed: true,
    });
    const summaryFilters: Record<string, any> = {
      dept: dept === 'all' ? undefined : dept,
      search: search || undefined,
      searchType,
      workzone: workzone || undefined,
      branchId,
      ctype: ctype || undefined,
      statusUpdate: status === 'assigned' ? 'assigned' : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      includeClosed: status === 'close',
    };
    if (status === 'close') {
      summaryFilters.ticketStatus = 'close';
    }

    const summary = await DailyTicketService.getDailyTicketSummary(
      user.role,
      user.id_user,
      summaryFilters,
    );
    const total = summary.total;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    if (total === 0) {
      return {
        data: [],
        summary: { total: 0, open: 0, assigned: 0, close: 0 },
        total: 0,
        page,
        limit,
        totalPages: 1,
      };
    }

    const orderedTickets = await prisma.ticket.findMany({
      where: mainWhere,
      orderBy: [{ reported_date: 'desc' }, { id_ticket: 'desc' }],
      skip: offset,
      take: limit,
      select: {
        id_ticket: true,
        incident: true,
        summary: true,
        reported_date: true,
        owner_group: true,
        service_type: true,
        workzone: true,
        contact_phone: true,
        contact_name: true,
        customer_type: true,
        customer_name: true,
        service_no: true,
        symptom: true,
        device_name: true,
        status: true,
        status_update: true,
        jenis_tiket_1: true,
        jenis_tiket_2: true,
        gaul: true,
        durasi_ticket: true,
        booking_date: true,
        closed_at: true,
        alamat: true,
        guarantee_status: true,
        flagging_manja: true,
        status_ttr_12_gold: true,
        status_ttr_3_diamond: true,
        status_ttr_6_platinum: true,
        status_ttr_24_reguler: true,
        description_solution_dompis: true,
        rca: true,
        sub_rca: true,
        users: { select: { nama: true, username: true } },
        ticket_tracking: { select: { assigned_at: true } },
      },
    });

      const data = orderedTickets.map((t: any) => {
    const usiaOpen = computeAge(t.reported_date);
        const statusClosing = CLOSE_STATUS_VALUES.includes((t.status ?? '').trim().toUpperCase()) ? 'CLOSE' : 'OPEN';
        const maxTtr = getMaxTtr(t);
        const latestStatus = t.status_update ?? '';
        const assignmentDate = t.ticket_tracking?.assigned_at ?? null;

        return [
          usiaOpen,
          t.incident ?? '',
          t.summary ?? '',
          t.reported_date ?? '',
          t.owner_group ?? '',
          t.service_type ?? '',
          t.workzone ?? '',
          t.contact_phone ?? '',
          t.contact_name ?? '',
          t.customer_type ?? '',
          t.customer_name ?? '',
          t.service_no ?? '',
          t.symptom ?? '',
          t.device_name ?? '',
          latestStatus,
          t.jenis_tiket_1 ?? '',
          t.jenis_tiket_2 ?? '',
          t.gaul ?? '',
          t.durasi_ticket ?? '',
          statusClosing,
          maxTtr,
          t.alamat ?? '',
          t.users?.nama ?? '',
          t.users?.username ?? '',
          t.status_update ?? '',
          t.description_solution_dompis ?? '',
          t.rca ?? '',
          t.sub_rca ?? '',
          formatDate(assignmentDate),
          formatDate(t.booking_date),
          formatDateTime(t.closed_at),
          t.reported_date ?? '',
        ];
      });

      return {
        data,
        summary,
        total,
        page,
        limit,
        totalPages,
      };
    }, CACHE_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      data: result.data,
      summary: result.summary,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal memuat data') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
