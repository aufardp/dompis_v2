import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { TicketService } from '@/app/libs/services/tickets.service';
import { getEffectiveMaxTtrLabel } from '@/app/libs/tickets/effective';
import { parseSearchType } from '@/lib/search-intent';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  writeAuditLog,
  extractClientMeta,
} from '@/app/libs/services/audit-log.service';
import { ApiError } from '@/app/libs/apiError';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const SEMESTA_EXPORT_MAX_ROWS = Number.parseInt(
  process.env.SEMESTA_EXPORT_MAX_ROWS || '500000',
  10,
);

// XLSX is built entirely in memory (aoa_to_sheet + XLSX.write), so its ceiling
// is deliberately far below the CSV one even though the row cap is shared.
// CSV streams chunk-by-chunk and only ever holds one chunk in memory.
const SEMESTA_XLSX_MAX_ROWS = Number.parseInt(
  process.env.SEMESTA_XLSX_MAX_ROWS || '50000',
  10,
);

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

function getTicketStatusLabel(raw: string | null | undefined): string {
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
    closed: 'Closed',
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
  if (flaggingManja === 'EXPIRED') return 'EXPIRED';

  const guarantee = String(ticket.guaranteeStatus ?? '').trim().toLowerCase();
  if (guarantee === 'guarantee') return 'FFG';

  const gamas = String(ticket.ticketIdGamas ?? '').trim();
  const invalid = ['-', '--', 'null', 'undefined', 'n/a', 'na', ''];
  if (gamas && !invalid.includes(gamas.toLowerCase())) return 'GAMAS';

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
  const d = new Date(reportedDate);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  if (diffDays > 0) {
    return `${diffDays}d ${remainingHours}h`;
  }
  return `${diffHours}h`;
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
    'Status Insera',
    'Status Dompis',
    'Flagging',
    'Age / SLA',
    'Max TTR',
    'Reported Date',
  ];
}

function buildRows(tickets: Array<Record<string, any>>) {
  const formatJenis = (ticket: Record<string, any>) =>
    ticket.jenisTiket ?? ticket.jenis_tiket_2 ?? '';

  return tickets.map((ticket) => [
    ticket.ticket ?? ticket.incident ?? '',
    ticket.serviceNo ?? ticket.service_no ?? '',
    ticket.contactName ?? ticket.contact_name ?? '',
    ticket.contactPhone ?? ticket.contact_phone ?? '',
    ticket.alamat ?? '',
    formatDate(ticket.bookingDate ?? ticket.booking_date),
    ticket.ctype ?? ticket.customerType ?? ticket.customer_type ?? '',
    formatJenis(ticket),
    ticket.workzone ?? '',
    ticket.technicianName ?? ticket.users?.nama ?? '',
    getTicketStatusLabel(ticket.status ?? ticket.statusInsera),
    getTicketStatusLabel(ticket.status_update ?? ticket.statusUpdate),
    getFlaggingLabel(ticket),
    computeAge(ticket.reportedDate ?? ticket.reported_date),
    getEffectiveMaxTtrLabel(ticket) ?? getMaxTtr(ticket, formatJenis(ticket)),
    formatDateTime(ticket.reportedDate ?? ticket.reported_date),
  ]);
}

/**
 * Serialises a batch of rows to CSV. Called once per streamed chunk, so the
 * result is never the whole file — that is what keeps large exports bounded in
 * memory.
 */
function rowsToCsv(rows: string[][]): string {
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
    const branchId = searchParams.get('branch') || searchParams.get('branchId') || undefined;
    const ctype = searchParams.get('ctype') || undefined;
    const statusUpdate = searchParams.get('statusUpdate') || undefined;
    const ticketStatus = searchParams.getAll('ticketStatus');
    const ticketType = searchParams.getAll('ticketType');
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const filters = {
      search,
      searchType,
      workzone,
      branchId,
      ctype,
      statusUpdate,
      dept,
      ticketStatus,
      ticketType,
      startDate,
      endDate,
    };
    const isCsv = format === 'csv';
    const columns = getTicketColumns();
    const filename = buildFilename(searchParams, isCsv ? 'csv' : 'xlsx');

    // CSV streams: rows are pulled in chunks and pushed straight to the
    // response, so a 500k-row export never holds more than one chunk in
    // memory. XLSX must materialise the whole sheet at once, hence its lower cap.
    if (isCsv) {
      const total = await TicketService.countExportTickets(
        user.role,
        user.id_user,
        filters,
      );
      if (total > SEMESTA_EXPORT_MAX_ROWS) {
        return NextResponse.json(
          {
            success: false,
            message: `Export terlalu besar (${total.toLocaleString('id-ID')} row, batas ${SEMESTA_EXPORT_MAX_ROWS.toLocaleString('id-ID')}). Persempit filter sebelum export.`,
          },
          { status: 413 },
        );
      }

      writeAuditLog({
        actor: { id_user: user.id_user, role: user.role },
        action: 'EXPORT',
        resourceType: 'export',
        resourceId: 'semesta',
        meta: {
          format,
          workzone: workzone ?? null,
          dept: dept ?? null,
          statusUpdate: statusUpdate ?? null,
          rows: total,
        },
        ...extractClientMeta(request),
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('\ufeff' + rowsToCsv([columns]) + '\n'));
          try {
            for await (const chunk of TicketService.iterateExportTickets(
              user.role,
              user.id_user,
              filters,
              SEMESTA_EXPORT_MAX_ROWS,
            )) {
              controller.enqueue(encoder.encode(rowsToCsv(buildRows(chunk as never))));
            }
          } catch (error) {
            logger.error('[SemestaExport] CSV stream failed', error, { rows: total });
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const tickets = await TicketService.getExportTickets(user.role, user.id_user, {
      ...filters,
      maxRows: SEMESTA_XLSX_MAX_ROWS,
    }).catch((error: unknown) => {
      // getExportTickets raises 413 with its own message; surface a hint that
      // CSV is the way for large ranges rather than "persempit filter".
      if (error instanceof ApiError && error.status === 413) {
        throw new ApiError(
          413,
          `${error.message} Untuk range besar, pilih format CSV.`,
        );
      }
      throw error;
    });

    writeAuditLog({
      actor: { id_user: user.id_user, role: user.role },
      action: 'EXPORT',
      resourceType: 'export',
      resourceId: 'semesta',
      meta: {
        format,
        workzone: workzone ?? null,
        dept: dept ?? null,
        statusUpdate: statusUpdate ?? null,
        rows: tickets.length,
      },
      ...extractClientMeta(request),
    });

    const rows = buildRows(tickets);

    const XLSX = await import('xlsx');
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
