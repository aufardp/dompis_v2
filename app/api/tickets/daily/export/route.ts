import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { normalizeJenis } from '@/app/libs/tickets/jenis';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const EXPORT_CACHE_TTL = 30;

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildExportCacheKey(
  userId: number,
  dept: string,
  ticketType: string[],
  statusUpdate: string[],
  flagging: string[],
): string {
  return `daily_export:${userId}:${dept}:${ticketType.sort().join(',')}:${statusUpdate.sort().join(',')}:${flagging.sort().join(',')}`;
}

function getExportColumns() {
  return [
    'Ticket',
    'Service No',
    'Customer',
    'Phone',
    'Address',
    'Booking Date',
    'Customer Type',
    'Jenis Tiket',
    'Workzone',
    'Technician',
    'Status',
    'Flagging',
    'Age / SLA',
    'Max TTR',
    'Reported Date',
  ];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
}

function formatDateTime(value: string | null | undefined): string {
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
  } catch {
    return '';
  }
}

function getStatusLabel(raw: string | null | undefined): string {
  if (!raw) return 'Open';
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    open: 'Open',
    assigned: 'Assigned',
    on_progress: 'On Progress',
    pending: 'Pending',
    close: 'Close',
  };
  return map[v] ?? raw;
}

function getFlaggingLabel(ticket: {
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
  ticketIdGamas?: string | null;
}): string {
  const { flaggingManja, guaranteeStatus, ticketIdGamas } = ticket;

  if (flaggingManja === 'P1') return 'P1';
  if (flaggingManja === 'P+') return 'P+';

  const gs = (guaranteeStatus ?? '').trim().toLowerCase();
  if (gs === 'guarantee') return 'FFG';

  const gamasRaw = ticketIdGamas ?? ticket.ticketIdGamas ?? null;
  const gamas = String(gamasRaw ?? '').trim();
  const invalidGamas = ['-', '--', 'null', 'undefined', 'n/a', 'na', ''];
  if (gamas && !invalidGamas.includes(gamas.toLowerCase())) {
    return 'GAMAS';
  }

  return '';
}

function getMaxTtr(
  ticket: {
    ctype?: string;
    customerType?: string;
    maxTtrReguler?: string | null;
    maxTtrGold?: string | null;
    maxTtrPlatinum?: string | null;
    maxTtrDiamond?: string | null;
  },
  jenisRaw: string | null | undefined,
): string {
  const ctype = (ticket.ctype || ticket.customerType || '').toUpperCase();

  if (ctype === 'HVC_GOLD' || jenisRaw?.toUpperCase().includes('GOLD')) {
    return ticket.maxTtrGold ?? '';
  }
  if (ctype === 'HVC_PLATINUM' || jenisRaw?.toUpperCase().includes('PLATINUM')) {
    return ticket.maxTtrPlatinum ?? '';
  }
  if (ctype === 'HVC_DIAMOND' || jenisRaw?.toUpperCase().includes('DIAMOND')) {
    return ticket.maxTtrDiamond ?? '';
  }
  return ticket.maxTtrReguler ?? '';
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
    if (diffDays > 0) {
      return `${diffDays}d ${remainingHours}h`;
    }
    return `${diffHours}h`;
  } catch {
    return '';
  }
}

function filterTicketByJenis(
  ticket: any,
  jenisFilter: string[],
  dept: string,
): boolean {
  if (jenisFilter.length === 0) return true;

  const raw = ticket.jenisTiket ?? ticket.JENIS_TIKET ?? '';
  const normalized = normalizeJenis(raw);

  if (dept === 'b2c') {
    return jenisFilter.some((f) => {
      const n = normalizeJenis(f);
      if (n === normalized) return true;
      if (n === 'hvc' && (raw.toUpperCase().includes('HVC') || normalized === 'hvc')) return true;
      return false;
    });
  }

  if (dept === 'b2b') {
    return jenisFilter.includes(normalized);
  }

  return true;
}

function filterTicketByStatus(
  ticket: any,
  statusFilter: string[],
): boolean {
  if (statusFilter.length === 0) return true;

  const statusRaw = ticket.STATUS_UPDATE ?? ticket.statusUpdate ?? '';
  const status = statusRaw.trim().toLowerCase();

  return statusFilter.some((f) => {
    if (f === 'close') return isTicketClosed(statusRaw);
    return status === f;
  });
}

function filterTicketByFlagging(
  ticket: any,
  flaggingFilter: string[],
): boolean {
  if (flaggingFilter.length === 0) return true;

  return flaggingFilter.some((f) => {
    if (f === 'P1') return (ticket.flaggingManja ?? ticket.FLAGGING_MANJA ?? '') === 'P1';
    if (f === 'P+') return (ticket.flaggingManja ?? ticket.FLAGGING_MANJA ?? '') === 'P+';
    if (f === 'FFG') {
      const gs = (ticket.guaranteeStatus ?? ticket.GUARANTE_STATUS ?? '').trim().toLowerCase();
      return gs === 'guarantee';
    }
    if (f === 'GAMAS') {
      const candidates = [
        ticket.ticketIdGamas,
        ticket.TICKET_ID_GAMAS,
      ];
      const raw = candidates.find((v) => v !== null && v !== undefined);
      const normalized = String(raw ?? '').trim();
      const invalid = ['-', '--', 'null', 'undefined', 'n/a', 'na', ''];
      return normalized && !invalid.includes(normalized.toLowerCase());
    }
    return false;
  });
}

function applyFilters(tickets: any[], dept: string, filters: {
  ticketType: string[];
  statusUpdate: string[];
  flagging: string[];
}): any[] {
  return tickets.filter((t) => {
    if (!filterTicketByJenis(t, filters.ticketType, dept)) return false;
    if (!filterTicketByStatus(t, filters.statusUpdate)) return false;
    if (!filterTicketByFlagging(t, filters.flagging)) return false;
    return true;
  });
}

function buildTicketRow(ticket: any) {
  const jenisRaw = ticket.jenisTiket ?? ticket.JENIS_TIKET ?? '';
  return [
    ticket.ticket ?? ticket.INCIDENT ?? '',
    ticket.serviceNo ?? ticket.SERVICE_NO ?? '',
    ticket.contactName ?? ticket.CONTACT_NAME ?? '',
    ticket.contactPhone ?? ticket.CONTACT_PHONE ?? '',
    ticket.alamat ?? ticket.ALAMAT ?? '',
    formatDate(ticket.bookingDate ?? ticket.BOOKING_DATE),
    ticket.ctype ?? ticket.customerType ?? ticket.CUSTOMER_TYPE ?? '',
    jenisRaw,
    ticket.workzone ?? ticket.WORKZONE ?? '',
    ticket.technicianName ?? ticket.users?.nama ?? '',
    getStatusLabel(ticket.STATUS_UPDATE ?? ticket.statusUpdate),
    getFlaggingLabel(ticket),
    computeAge(ticket.reportedDate ?? ticket.REPORTED_DATE),
    getMaxTtr(ticket, jenisRaw),
    formatDateTime(ticket.reportedDate ?? ticket.REPORTED_DATE),
  ];
}

function arrayToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(','),
    )
    .join('\n');
}

async function buildXlsx(data: any[], columns: string[], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([columns, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tiket');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function GET(request: Request) {
  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);

    const format = (searchParams.get('format') ?? 'xlsx').toLowerCase();
    const dept = (searchParams.get('dept') ?? 'b2c') as 'b2b' | 'b2c';

    const ticketTypeRaw = searchParams.getAll('ticketType');
    const statusUpdateRaw = searchParams.getAll('statusUpdate');
    const flaggingRaw = searchParams.getAll('flagging');

    const filters = {
      ticketType: ticketTypeRaw,
      statusUpdate: statusUpdateRaw,
      flagging: flaggingRaw,
    };

    const cacheKey = buildExportCacheKey(
      user.id_user,
      dept,
      ticketTypeRaw,
      statusUpdateRaw,
      flaggingRaw,
    );

    const cached = await getCache(cacheKey);
    let allTickets: any[] = [];

    if (cached) {
      allTickets = cached as any[];
    } else {
      const B2C_CTYPES = ['REGULER', 'HVC_GOLD', 'HVC_PLATINUM', 'HVC_DIAMOND'];

      const whereBase: Record<string, any> = {};

      if (user.role === 'teknisi') {
        whereBase.teknisi_user_id = user.id_user;
      } else {
        const { getWorkzonesForUser } = await import('@/app/helpers/ticket.helpers');
        const workzones = await getWorkzonesForUser(user.id_user);

        if (workzones.length === 0) {
          return NextResponse.json(
            { success: true, data: [], message: 'No workzone access' },
            { status: 200 },
          );
        }

        whereBase.WORKZONE = { in: workzones };
      }

      await DailyTicketService.applyDailyTicketFilter(whereBase);

      if (dept === 'b2c') {
        whereBase.CUSTOMER_TYPE = { in: B2C_CTYPES };
      } else if (dept === 'b2b') {
        whereBase.AND = [
          ...(whereBase.AND ?? []),
          {
            OR: [
              { CUSTOMER_TYPE: { notIn: B2C_CTYPES } },
              { CUSTOMER_TYPE: null },
            ],
          },
        ];
      }

      const FETCH_PAGE_SIZE = 500;
      const firstRes = await DailyTicketService.getDailyTicketTable(
        user.role,
        user.id_user,
        {
          page: 1,
          limit: FETCH_PAGE_SIZE,
          dept,
        },
      );

      allTickets.push(...(firstRes.data ?? []));

      const totalPages = firstRes.totalPages ?? 1;
      for (let p = 2; p <= totalPages; p++) {
        const pageRes = await DailyTicketService.getDailyTicketTable(
          user.role,
          user.id_user,
          { page: p, limit: FETCH_PAGE_SIZE, dept },
        );
        allTickets.push(...(pageRes.data ?? []));
        if ((pageRes.data ?? []).length < FETCH_PAGE_SIZE) break;
      }

      await setCache(cacheKey, allTickets, EXPORT_CACHE_TTL);
    }

    const filtered = applyFilters(allTickets, dept, filters);

    const columns = getExportColumns();
    const rows = filtered.map(buildTicketRow);

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const label = dept.toUpperCase();
    const filenameBase = `Tiket_${label}_${dateStr}`;

    if (format === 'csv') {
      const csvContent = arrayToCsv([columns, ...rows]);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      return new Response(blob, {
        headers: {
          'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
          'Content-Type': 'text/csv;charset=utf-8',
        },
      });
    }

    const blob = await buildXlsx(rows, columns, filenameBase);
    return new Response(blob, {
      headers: {
        'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Export gagal'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}