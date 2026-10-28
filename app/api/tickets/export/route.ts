import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { TicketService } from '@/app/libs/services/tickets.service';
import { parseSearchType } from '@/lib/search-intent';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  TICKET_EXPORT_COLUMNS,
  buildTicketExportRow,
} from '@/app/libs/tickets/ticket-export';
import { mapTicket } from '@/app/libs/services/daily-ticket-helpers';
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

/**
 * Serialises a batch of rows to CSV. Called once per streamed chunk, so the
 * result is never the whole file — that is what keeps large exports bounded in
 * memory.
 */
function rowsToCsv(rows: Array<Array<string | number>>): string {
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

function buildRows(rows: Array<Record<string, any>>): Array<Array<string | number>> {
  return rows.map((row) => buildTicketExportRow(mapTicket(row)));
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
    const columns = TICKET_EXPORT_COLUMNS;
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
