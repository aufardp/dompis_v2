import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { getCache, setCache } from '@/lib/cache';
import { parseSearchType } from '@/lib/search-intent';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  TICKET_EXPORT_COLUMNS,
  buildTicketExportRow,
} from '@/app/libs/tickets/ticket-export';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

export const dynamic = 'force-dynamic';

const EXPORT_CACHE_TTL = 30;
const DIRECT_EXPORT_MAX_ROWS = Number.parseInt(
  process.env.DAILY_EXPORT_MAX_ROWS || '10000',
  10,
);

function rejectTooLarge(count: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      message: `Export terlalu besar (${count} row). Persempit filter atau turunkan rentang data sebelum export.`,
    },
    { status: 413 },
  );
}

function toInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildExportCacheKey(
  userId: number,
  dept: string,
  search: string,
  searchType: string | undefined,
  workzone: string,
  branchId: string | undefined,
  ctype: string,
  startDate: string,
  endDate: string,
  ticketType: string[],
  ticketGroup: string[],
  operationalBucket: string[],
  anomalyBucket: string[],
  regulerOnly: string,
  statusUpdate: string[],
  ticketStatus: string[],
  flagging: string[],
  validasiOnly: boolean,
  includeClosed: boolean,
): string {
  return `daily_export:${userId}:${dept}:${search}:${searchType ?? ''}:${workzone}:${branchId ?? ''}:${ctype}:${startDate}:${endDate}:${ticketType.sort().join(',')}:${ticketGroup.sort().join(',')}:${operationalBucket.sort().join(',')}:${anomalyBucket.sort().join(',')}:${regulerOnly}:${statusUpdate.sort().join(',')}:${ticketStatus.sort().join(',')}:${flagging.sort().join(',')}:${validasiOnly ? 'v' : 'm'}:${includeClosed ? 'c' : 'o'}`;
}

function filterTicketByJenis(
  ticket: any,
  jenisFilter: string[],
  dept: string,
): boolean {
  if (jenisFilter.length === 0) return true;

  const raw = ticket.jenisTiket ?? ticket.jenis_tiket_2 ?? '';
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

  if (dept === 'netral' || dept === 'neutral') {
    return jenisFilter.includes(normalized);
  }

  return true;
}

function filterTicketByStatus(
  ticket: any,
  statusFilter: string[],
): boolean {
  if (statusFilter.length === 0) return true;

  const statusRaw = ticket.status_update ?? ticket.statusUpdate ?? '';
  const status = statusRaw.trim().toLowerCase();

  return statusFilter.some((f) => {
    const normalizedFilter = String(f ?? '').trim().toLowerCase();
    if (normalizedFilter === 'close') return isTicketClosed(statusRaw);
    return status === normalizedFilter;
  });
}

function filterTicketByTicketStatus(
  ticket: any,
  ticketStatusFilter: string[],
): boolean {
  if (ticketStatusFilter.length === 0) return true;

  const status = String(ticket.status ?? '').trim().toUpperCase();
  if (!status) return false;

  return ticketStatusFilter.some(
    (f) => String(f ?? '').trim().toUpperCase() === status,
  );
}

function filterTicketByFlagging(
  ticket: any,
  flaggingFilter: string[],
): boolean {
  if (flaggingFilter.length === 0) return true;

  return flaggingFilter.some((f) => {
    if (f === 'P1') return (ticket.flaggingManja ?? ticket.flagging_manja ?? '') === 'P1';
    if (f === 'P+') return (ticket.flaggingManja ?? ticket.flagging_manja ?? '') === 'P+';
    if (f === 'EXPIRED') return (ticket.flaggingManja ?? ticket.flagging_manja ?? '') === 'EXPIRED';
    if (f === 'FFG') {
      const gs = (ticket.guaranteeStatus ?? ticket.GUARANTE_STATUS ?? '').trim().toLowerCase();
      return gs === 'guarantee';
    }
    if (f === 'GAMAS') {
      const candidates = [
        ticket.ticketIdGamas,
        ticket.ticket_id_gamas,
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
  ticketGroup: string[];
  statusUpdate: string[];
  ticketStatus: string[];
  flagging: string[];
}): any[] {
  return tickets.filter((t) => {
    if (!filterTicketByJenis(t, filters.ticketType, dept)) return false;
    if (!filterTicketByStatus(t, filters.statusUpdate)) return false;
    if (!filterTicketByTicketStatus(t, filters.ticketStatus)) return false;
    if (!filterTicketByFlagging(t, filters.flagging)) return false;
    return true;
  });
}

function arrayToCsv(rows: Array<Array<string | number>>): string {
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
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer;
  return new Blob([Uint8Array.from(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'daily-tickets-export',
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
    const deptRaw = searchParams.get('dept') ?? 'b2c';
    const dept = deptRaw === 'neutral' ? 'netral' : deptRaw;
    const search = searchParams.get('search') ?? '';
    const searchType = parseSearchType(searchParams.get('searchType'));
    const workzone = searchParams.get('workzone') ?? '';
    const branchId =
      searchParams.get('branchId') || searchParams.get('branch') || undefined;
    const ctype = searchParams.get('ctype') ?? '';
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';
    const FETCH_PAGE_SIZE = 250;

    const ticketTypeRaw = searchParams.getAll('ticketType');
    const ticketGroupRaw = searchParams.getAll('ticketGroup');
    const operationalBucketRaw = searchParams.getAll('operationalBucket');
    const anomalyBucketRaw = searchParams.getAll('anomalyBucket');
    const regulerOnlyRaw = searchParams.get('regulerOnly') ?? '';
    const statusUpdateRaw = searchParams.getAll('statusUpdate');
    const ticketStatusRaw = searchParams.getAll('ticketStatus');
    const flaggingRaw = searchParams.getAll('flagging');
    const gamasOnly = searchParams.get('gamasOnly') === 'true';
    const validasiOnly = searchParams.get('validasiOnly') === 'true';
    const includeClosed =
      searchParams.get('includeClosed') === 'true' ||
      [...ticketStatusRaw, ...statusUpdateRaw].some((value) =>
        CLOSE_STATUS_VALUES.includes(value.trim().toUpperCase()),
      );

    const filters = {
      ticketType: ticketTypeRaw,
      ticketGroup: ticketGroupRaw,
      operationalBucket: operationalBucketRaw,
      anomalyBucket: anomalyBucketRaw,
      regulerOnly: regulerOnlyRaw === 'true',
      statusUpdate: statusUpdateRaw,
      ticketStatus: ticketStatusRaw,
      flagging: flaggingRaw,
    };

    const cacheKey = buildExportCacheKey(
      user.id_user,
      dept,
      search,
      searchType,
      workzone,
      branchId,
      ctype,
      startDate,
      endDate,
      ticketTypeRaw,
      ticketGroupRaw,
      operationalBucketRaw,
      anomalyBucketRaw,
      regulerOnlyRaw,
      statusUpdateRaw,
      ticketStatusRaw,
      flaggingRaw,
      validasiOnly,
      includeClosed,
    );

    const cached = await getCache(cacheKey);
    let allTickets: any[] = [];

    if (cached) {
      allTickets = cached as any[];
    } else if (validasiOnly) {
      const fetchValidasiForDept = async (
        d: 'b2b' | 'b2c' | 'netral',
      ): Promise<any[]> => {
        const results: any[] = [];
        const firstRes = await DailyTicketService.getDailyTicketTable(
          user.role,
          user.id_user,
          {
            page: 1,
            limit: FETCH_PAGE_SIZE,
            dept: d,
            search: search || undefined,
            searchType,
            workzone: workzone || undefined,
            branchId,
            ctype: ctype || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            validasiPage: 1,
            validasiLimit: FETCH_PAGE_SIZE,
            includeClosed,
            includeValidasi: true,
            includeOptions: false,
            ticketGroup: ticketGroupRaw,
            operationalBucket: operationalBucketRaw,
            anomalyBucket: anomalyBucketRaw,
            regulerOnly: regulerOnlyRaw === 'true',
            ticketStatus: ticketStatusRaw,
            statusUpdate: statusUpdateRaw,
            ticketType: ticketTypeRaw,
            flagging: flaggingRaw,
            gamasOnly,
          },
        );

        results.push(...(firstRes.validasiTickets ?? []));

        const vPages = Math.max(1, firstRes.validasiTotalPages ?? 1);
        if (vPages > 1) {
          const remainingPages = Array.from({ length: vPages - 1 }, (_, i) => i + 2);
          const pageResults = await Promise.all(
            remainingPages.map((p) =>
              DailyTicketService.getDailyTicketTable(
                user.role,
                user.id_user,
                {
                  page: 1,
                  limit: FETCH_PAGE_SIZE,
                  dept: d,
                  search: search || undefined,
                  searchType,
                  workzone: workzone || undefined,
                  branchId,
                  ctype: ctype || undefined,
                  startDate: startDate || undefined,
                  endDate: endDate || undefined,
                  validasiPage: p,
                  validasiLimit: FETCH_PAGE_SIZE,
                  includeClosed,
                  includeValidasi: true,
                  includeSummary: false,
                  includeOptions: false,
                  ticketGroup: ticketGroupRaw,
                  operationalBucket: operationalBucketRaw,
                  anomalyBucket: anomalyBucketRaw,
                  regulerOnly: regulerOnlyRaw === 'true',
                  ticketStatus: ticketStatusRaw,
                  statusUpdate: statusUpdateRaw,
                  ticketType: ticketTypeRaw,
                  flagging: flaggingRaw,
                  gamasOnly,
                },
              ),
            ),
          );
          for (const pageRes of pageResults) {
            results.push(...(pageRes.validasiTickets ?? []));
          }
        }

        return results;
      };

      if (dept === 'all') {
        const [b2cTickets, b2bTickets, netralTickets] = await Promise.all([
          fetchValidasiForDept('b2c'),
          fetchValidasiForDept('b2b'),
          fetchValidasiForDept('netral'),
        ]);
        allTickets = [...b2cTickets, ...b2bTickets, ...netralTickets];
      } else {
        const normalizedDept = dept === 'neutral' ? 'netral' : dept;
        allTickets = await fetchValidasiForDept(normalizedDept as 'b2b' | 'b2c' | 'netral');
      }

      if (allTickets.length > DIRECT_EXPORT_MAX_ROWS) {
        return rejectTooLarge(allTickets.length);
      }
    } else {
      const firstRes = await DailyTicketService.getDailyTicketTable(
        user.role,
        user.id_user,
        {
          page: 1,
          limit: FETCH_PAGE_SIZE,
          dept,
          includeClosed,
          search: search || undefined,
          searchType,
          workzone: workzone || undefined,
          branchId,
          ctype: ctype || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          includeValidasi: false,
          includeOptions: false,
          ticketGroup: ticketGroupRaw,
          operationalBucket: operationalBucketRaw,
          anomalyBucket: anomalyBucketRaw,
          regulerOnly: regulerOnlyRaw === 'true',
          ticketStatus: ticketStatusRaw,
        statusUpdate: statusUpdateRaw,
        ticketType: ticketTypeRaw,
        flagging: flaggingRaw,
        gamasOnly,
      },
    );

    allTickets.push(...(firstRes.data ?? []));

    if (allTickets.length > DIRECT_EXPORT_MAX_ROWS) {
      return rejectTooLarge(allTickets.length);
    }

    const totalPages = Math.max(1, firstRes.totalPages ?? 1);
    if (totalPages > 1) {
      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      const pageResults = await Promise.all(
        remainingPages.map((p) =>
          DailyTicketService.getDailyTicketTable(
            user.role,
            user.id_user,
            {
              page: p,
              limit: FETCH_PAGE_SIZE,
              dept,
              includeClosed,
              search: search || undefined,
              searchType,
              workzone: workzone || undefined,
              branchId,
              ctype: ctype || undefined,
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              includeValidasi: false,
              includeSummary: false,
              includeOptions: false,
              ticketGroup: ticketGroupRaw,
              operationalBucket: operationalBucketRaw,
              anomalyBucket: anomalyBucketRaw,
              regulerOnly: regulerOnlyRaw === 'true',
              ticketStatus: ticketStatusRaw,
              statusUpdate: statusUpdateRaw,
              ticketType: ticketTypeRaw,
              flagging: flaggingRaw,
              gamasOnly,
            },
          ),
        ),
      );
      for (const pageRes of pageResults) {
        allTickets.push(...(pageRes.data ?? []));
        if (allTickets.length > DIRECT_EXPORT_MAX_ROWS) {
          return rejectTooLarge(allTickets.length);
        }
      }
    }

    if (allTickets.length <= 500) {
      await setCache(cacheKey, allTickets, EXPORT_CACHE_TTL);
    }
    }

    const filtered = applyFilters(allTickets, dept, filters);
    if (filtered.length > DIRECT_EXPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          success: false,
          message: `Export terlalu besar (${filtered.length} row). Persempit filter atau turunkan rentang data sebelum export.`,
        },
        { status: 413 },
      );
    }

    const columns = TICKET_EXPORT_COLUMNS;
    const rows = filtered.map(buildTicketExportRow);

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const label = validasiOnly ? 'Validasi' : dept.toUpperCase();
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
