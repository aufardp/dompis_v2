import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { getCache, setCache } from '@/lib/cache';
import { parseSearchType } from '@/lib/search-intent';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

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
): string {
  return `daily_export:${userId}:${dept}:${search}:${searchType ?? ''}:${workzone}:${ctype}:${startDate}:${endDate}:${ticketType.sort().join(',')}:${ticketGroup.sort().join(',')}:${operationalBucket.sort().join(',')}:${anomalyBucket.sort().join(',')}:${regulerOnly}:${statusUpdate.sort().join(',')}:${ticketStatus.sort().join(',')}:${flagging.sort().join(',')}:${validasiOnly ? 'v' : 'm'}`;
}

function getExportColumns() {
  return [
    'Ticket',
    'Summary',
    'Reported Date',
    'Owner Group',
    'Customer Segment',
    'Service Type',
    'Witel',
    'Workzone',
    'Status',
    'Status Date',
    'Ticket ID Gamas',
    'Contact Phone',
    'Contact Name',
    'Booking Date',
    'Source Ticket',
    'Channel',
    'Customer Type',
    'Customer Name',
    'Service No',
    'Incident Domain',
    'Symptom',
    'Solution',
    'Description Actual Solution',
    'Description Solution Dompis',
    'Device Name',
    'Worklog Summary',
    'Classification Flag',
    'Realm',
    'TSC Result',
    'SCC Result',
    'SN ONT',
    'Tipe ONT',
    'RK Information',
    'Classification Path',
    'LAPUL',
    'GAUL',
    'ONU RX',
    'Pending Reason',
    'Guarantee Status',
    'Status Insera',
    'Status Dompis',
    'Jenis Tiket 1',
    'Jenis Tiket 2',
    'Address',
    'Flagging Manja',
    'Flagging',
    'Pending Dompis',
    'SQM Update Reason',
    'RCA',
    'Sub RCA',
    'Technician',
    'Technician User ID',
    'Closed At',
    'Age / SLA',
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
  const { flaggingManja, guaranteeStatus, ticketIdGamas } = ticket;

  if (flaggingManja === 'P1') return 'P1';
  if (flaggingManja === 'P+') return 'P+';
  if (flaggingManja === 'EXPIRED') return 'EXPIRED';

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
    if (f === 'close') return isTicketClosed(statusRaw);
    return status === f;
  });
}

function filterTicketByTicketStatus(
  ticket: any,
  ticketStatusFilter: string[],
): boolean {
  if (ticketStatusFilter.length === 0) return true;

  const status = String(ticket.status ?? '').trim();
  if (!status) return false;

  return ticketStatusFilter.includes(status);
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

function buildTicketRow(ticket: any) {
  const jenisRaw = ticket.jenisTiket ?? ticket.jenis_tiket_2 ?? '';
  return [
    ticket.ticket ?? ticket.incident ?? '',
    ticket.summary ?? '',
    formatDateTime(ticket.reportedDate ?? ticket.reported_date),
    ticket.ownerGroup ?? ticket.owner_group ?? '',
    ticket.customerSegment ?? ticket.customer_segment ?? '',
    ticket.serviceType ?? ticket.service_type ?? '',
    ticket.witel ?? '',
    ticket.workzone ?? '',
    getTicketStatusLabel(ticket.status ?? ticket.statusInsera),
    formatDateTime(ticket.statusDate ?? ticket.status_date),
    ticket.ticketIdGamas ?? ticket.ticket_id_gamas ?? '',
    ticket.contactPhone ?? ticket.contact_phone ?? '',
    ticket.contactName ?? ticket.contact_name ?? '',
    formatDate(ticket.bookingDate ?? ticket.booking_date),
    ticket.sourceTicket ?? ticket.source_ticket ?? '',
    ticket.channel ?? '',
    ticket.ctype ?? ticket.customerType ?? ticket.customer_type ?? '',
    ticket.customerName ?? ticket.customer_name ?? '',
    ticket.serviceNo ?? ticket.service_no ?? '',
    ticket.incidentDomain ?? ticket.incident_domain ?? '',
    ticket.symptom ?? '',
    ticket.solution ?? '',
    ticket.descriptionActualSolution ?? ticket.description_actual_solution ?? '',
    ticket.descriptionSolutionDompis ?? ticket.description_solution_dompis ?? '',
    ticket.deviceName ?? ticket.device_name ?? '',
    ticket.worklogSummary ?? ticket.worklog_summary ?? '',
    ticket.classificationFlag ?? ticket.classification_flag ?? '',
    ticket.realm ?? '',
    ticket.tscResult ?? ticket.tsc_result ?? '',
    ticket.sccResult ?? ticket.scc_result ?? '',
    ticket.snOnt ?? ticket.sn_ont ?? '',
    ticket.tipeOnt ?? ticket.tipe_ont ?? '',
    ticket.rkInformation ?? ticket.rk_information ?? '',
    ticket.classificationPath ?? ticket.classification_path ?? '',
    ticket.lapul ?? '',
    ticket.gaul ?? '',
    ticket.onuRx ?? ticket.onu_rx ?? '',
    ticket.pendingReason ?? ticket.pending_reason ?? '',
    ticket.guaranteeStatus ?? ticket.guarantee_status ?? '',
    getTicketStatusLabel(ticket.status ?? ticket.statusInsera),
    getTicketStatusLabel(ticket.status_update ?? ticket.statusUpdate),
    ticket.jenisTiket1 ?? ticket.jenis_tiket_1 ?? '',
    jenisRaw,
    ticket.alamat ?? '',
    ticket.flaggingManja ?? ticket.flagging_manja ?? '',
    getFlaggingLabel(ticket),
    ticket.pendingDompis ?? ticket.pending_dompis ?? '',
    ticket.sqmUpdateReason ?? ticket.sqm_update_reason ?? '',
    ticket.rca ?? '',
    ticket.subRca ?? ticket.sub_rca ?? '',
    ticket.technicianName ?? ticket.users?.nama ?? '',
    ticket.teknisiUserId ?? ticket.teknisi_user_id ?? '',
    formatDateTime(ticket.closedAt ?? ticket.closed_at),
    computeAge(ticket.reportedDate ?? ticket.reported_date),
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
    const dept = searchParams.get('dept') ?? 'b2c';
    const search = searchParams.get('search') ?? '';
    const searchType = parseSearchType(searchParams.get('searchType'));
    const workzone = searchParams.get('workzone') ?? '';
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
    );

    const cached = await getCache(cacheKey);
    let allTickets: any[] = [];

    if (cached) {
      allTickets = cached as any[];
    } else if (validasiOnly) {
      const fetchValidasiForDept = async (
        d: 'b2b' | 'b2c',
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
            ctype: ctype || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            validasiPage: 1,
            validasiLimit: FETCH_PAGE_SIZE,
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
        );

        results.push(...(firstRes.validasiTickets ?? []));

        const vPages = firstRes.validasiTotalPages ?? 1;
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
                  ctype: ctype || undefined,
                  startDate: startDate || undefined,
                  endDate: endDate || undefined,
                  validasiPage: p,
                  validasiLimit: FETCH_PAGE_SIZE,
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
        const [b2cTickets, b2bTickets] = await Promise.all([
          fetchValidasiForDept('b2c'),
          fetchValidasiForDept('b2b'),
        ]);
        allTickets = [...b2cTickets, ...b2bTickets];
      } else {
        allTickets = await fetchValidasiForDept(dept as 'b2b' | 'b2c');
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
          search: search || undefined,
          searchType,
          workzone: workzone || undefined,
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
    );

    allTickets.push(...(firstRes.data ?? []));

    if (allTickets.length > DIRECT_EXPORT_MAX_ROWS) {
      return rejectTooLarge(allTickets.length);
    }

    const totalPages = firstRes.totalPages ?? 1;
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
              search: search || undefined,
              searchType,
              workzone: workzone || undefined,
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

    const columns = getExportColumns();
    const rows = filtered.map(buildTicketRow);

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
