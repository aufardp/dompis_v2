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

function buildStatusInseraWhere(status: string): Record<string, any> | null {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return null;

  if (normalized === 'close') {
    return {
      status: { in: [...CLOSE_STATUS_VALUES, ...CLOSE_STATUS_VALUES.map((item) => item.toLowerCase())] },
    };
  }

  return {
    NOT: {
      status: { in: [...CLOSE_STATUS_VALUES, ...CLOSE_STATUS_VALUES.map((item) => item.toLowerCase())] },
    },
  };
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

    const dept = searchParams.get('dept') ?? 'all';
    const search = searchParams.get('search') ?? '';
    const searchType = parseSearchType(searchParams.get('searchType'));
    const workzone = searchParams.get('workzone') ?? '';
    const ctype = searchParams.get('ctype') ?? '';
    const status = searchParams.get('status') ?? 'all';
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';
    const page = toInt(searchParams.get('page'), 1);
    const limit = Math.min(toInt(searchParams.get('limit'), 100), 100);
    const cacheKey = buildCacheKey(user.role, user.id_user, searchParams);

    const result = await getOrSetCache(cacheKey || `tickets_daily_detail_wo_hi:${user.role}:${user.id_user}:uncached`, async () => {
    const baseWhere = await DailyTicketService.buildDetailWoHiWhere(
      user.role, user.id_user, {
        dept: dept === 'all' ? undefined : dept as 'b2b' | 'b2c',
        search: search || undefined,
        searchType,
        workzone: workzone || undefined,
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
    const statusWhere = buildStatusInseraWhere(status);
    const finalWhere = statusWhere
      ? { AND: [mainWhere, statusWhere] }
      : mainWhere;

    const total = await prisma.ticket.count({ where: finalWhere });
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

      // Summary counts by status using the same filtered scope as the table.
      const [statusGroups, orderedTickets] = await Promise.all([
        prisma.ticket.groupBy({
          by: ['status', 'status_update'],
          where: finalWhere,
          _count: { _all: true },
        }),
        prisma.ticket.findMany({
          where: finalWhere,
          orderBy: [{ reported_date: 'desc' }, { id_ticket: 'desc' }],
          skip: offset,
          take: limit,
          include: {
            users: { select: { nama: true, username: true } },
          },
        }),
      ]);
      let open = 0, assigned = 0, onProgress = 0, pending = 0, close = 0;
      for (const g of statusGroups) {
        const count = g._count._all;
        const s = (g.status ?? '').trim().toUpperCase();
        const su = (g.status_update ?? '').trim().toLowerCase();

        if (CLOSE_STATUS_VALUES.includes(s)) {
          close += count;
        } else if (su === 'assigned') {
          assigned += count;
        } else if (su === 'on_progress') {
          onProgress += count;
        } else if (su === 'pending') {
          pending += count;
        } else {
          open += count;
        }
      }
      const summary = { total, open, assigned: assigned + onProgress + pending, close };

      const ticketIds = orderedTickets.map(t => t.id_ticket);

      // Latest status from ticket_status_history per ticket
      const [statusHistories, assignments] = await Promise.all([
        prisma.ticket_status_history.findMany({
          where: { ticket_id: { in: ticketIds } },
          orderBy: { changed_at: 'desc' },
          select: { ticket_id: true, new_status: true },
          take: 1000,
        }),
        prisma.ticket_assignment_history.findMany({
          where: { ticket_id: { in: ticketIds }, is_active: true },
          orderBy: { assigned_at: 'asc' },
          select: { ticket_id: true, assigned_at: true },
          take: 1000,
        }),
      ]);

      const latestStatusPerTicket = new Map<number, string>();
      for (const h of statusHistories) {
        if (!latestStatusPerTicket.has(h.ticket_id)) {
          latestStatusPerTicket.set(h.ticket_id, h.new_status);
        }
      }

      const earliestAssignmentPerTicket = new Map<number, Date>();
      for (const a of assignments) {
        if (!earliestAssignmentPerTicket.has(a.ticket_id)) {
          earliestAssignmentPerTicket.set(a.ticket_id, a.assigned_at);
        }
      }

      const data = orderedTickets.map((t: any) => {
    const usiaOpen = computeAge(t.reported_date);
        const statusClosing = CLOSE_STATUS_VALUES.includes((t.status ?? '').trim().toUpperCase()) ? 'CLOSE' : 'OPEN';
        const maxTtr = getMaxTtr(t);
        const latestStatus = latestStatusPerTicket.get(t.id_ticket) ?? '';
        const assignmentDate = earliestAssignmentPerTicket.get(t.id_ticket);

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
