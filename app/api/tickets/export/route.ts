import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { TicketService } from '@/app/libs/services/tickets.service';
import { parseSearchType } from '@/lib/search-intent';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getStatusLabel(raw: string | null | undefined): string {
  if (!raw) return 'Open';
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    open: 'Open',
    assigned: 'Assigned',
    on_progress: 'On Progress',
    pending: 'Pending',
    escalated: 'Escalated',
    cancelled: 'Cancelled',
    close: 'Close',
  };
  return map[v] ?? raw;
}

function getFlaggingLabel(ticket: {
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
  ticketIdGamas?: string | null;
}): string {
  const flaggingManja = String(ticket.flaggingManja ?? '').trim();
  if (flaggingManja === 'P1') return 'P1';
  if (flaggingManja === 'P+') return 'P+';

  const guarantee = String(ticket.guaranteeStatus ?? '').trim().toLowerCase();
  if (guarantee === 'guarantee') return 'FFG';

  const gamas = String(ticket.ticketIdGamas ?? '').trim();
  const invalid = ['-', '--', 'null', 'undefined', 'n/a', 'na', ''];
  if (gamas && !invalid.includes(gamas.toLowerCase())) return 'GAMAS';

  return '';
}

function getTicketColumns() {
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
    'Reported Date',
  ];
}

function buildRows(tickets: Array<Record<string, any>>) {
  return tickets.map((ticket) => [
    ticket.ticket ?? ticket.incident ?? '',
    ticket.serviceNo ?? ticket.service_no ?? '',
    ticket.contactName ?? ticket.contact_name ?? '',
    ticket.contactPhone ?? ticket.contact_phone ?? '',
    ticket.alamat ?? '',
    formatDate(ticket.bookingDate ?? ticket.booking_date),
    ticket.ctype ?? ticket.customerType ?? ticket.customer_type ?? '',
    ticket.jenisTiket ?? ticket.jenis_tiket_2 ?? '',
    ticket.workzone ?? '',
    ticket.technicianName ?? ticket.users?.nama ?? '',
    getStatusLabel(ticket.status_update ?? ticket.status),
    getFlaggingLabel(ticket),
    formatDateTime(ticket.reportedDate ?? ticket.reported_date),
  ]);
}

function arrayToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    )
    .join('\n');
}

function buildFilename(
  searchParams: URLSearchParams,
  format: string,
): string {
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const range = startDate && endDate ? `${startDate}_${endDate}` : 'all_dates';
  return `semesta_tickets_${range}.${format}`;
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'tickets-export',
      limit: 3,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') ?? 'xlsx').toLowerCase();
    const dept = searchParams.get('dept') || undefined;
    const search = searchParams.get('search') || '';
    const searchType = parseSearchType(searchParams.get('searchType'));
    const workzone = searchParams.get('workzone') || undefined;
    const ctype = searchParams.get('ctype') || undefined;
    const statusUpdate = searchParams.get('statusUpdate') || undefined;
    const ticketType = searchParams.get('ticketType') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const tickets = await TicketService.getExportTickets(user.role, user.id_user, {
      search,
      searchType,
      workzone,
      ctype,
      statusUpdate,
      dept,
      ticketType,
      startDate,
      endDate,
      maxRows: 10000,
    });

    const columns = getTicketColumns();
    const rows = buildRows(tickets);
    const filename = buildFilename(searchParams, format === 'csv' ? 'csv' : 'xlsx');

    if (format === 'csv') {
      const csvContent = arrayToCsv([columns, ...rows]);
      return new NextResponse('\ufeff' + csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error exporting semesta tickets'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
