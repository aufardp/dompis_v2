import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { parseSearchType } from '@/lib/search-intent';
import { getCache, setCache } from '@/lib/cache';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { getEffectiveMaxTtrLabel } from '@/app/libs/tickets/effective';

export const dynamic = 'force-dynamic';

const EXPORT_CACHE_TTL = 30;
const DIRECT_EXPORT_MAX_ROWS = Number.parseInt(
  process.env.DAILY_EXPORT_MAX_ROWS || '10000', 10,
);

const DETAIL_COLUMNS = [
  'DURASI OPEN', 'INCIDENT', 'SUMMARY', 'REPORTED DATE',
  'OWNER GROUP', 'SERVICE TYPE', 'WORKZONE', 'CONTACT PHONE',
  'CONTACT NAME', 'CUSTOMER TYPE', 'CUSTOMER NAME', 'SERVICE NO',
  'SYMPTOM', 'DEVICE NAME', 'STATUS UPDATE', 'TYPE TIKET',
  'JENIS TIKET2', 'STATUS GAUL', 'DURASI TIKET', 'STATUS CLOSING',
  'TTR', 'ALAMAT', 'TEKNISI 1', 'LABOR CODE 1', 'HASIL VISIT',
  'LAPORAN TEKNISI', 'RCA', 'SUB_RCA', 'Tanggal Order',
  'BOOKING TIME', 'Tanggal Close', 'Tanggal Open',
];

function buildExportCacheKey(
  role: string,
  userId: number,
  params: URLSearchParams,
  format: string,
): string | null {
  const filterParams = new URLSearchParams(params);
  if (filterParams.has('_t')) return null;
  filterParams.sort();
  return `tickets_daily_detail_wo_hi_export:${role}:${userId}:${format}:${filterParams.toString()}`;
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

  const closedStatuses = [
    ...CLOSE_STATUS_VALUES,
    ...CLOSE_STATUS_VALUES.map((item) => item.toLowerCase()),
  ];

  if (normalized === 'close') {
    return {
      status: { in: closedStatuses },
    };
  }

  return {
    NOT: {
      status: { in: closedStatuses },
    },
  };
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

function buildDetailRow(ticket: any, latestStatus: string, assignmentDate: Date | null) {
  return [
    computeAge(ticket.reported_date),
    ticket.incident ?? '',
    ticket.summary ?? '',
    ticket.reported_date ?? '',
    ticket.owner_group ?? '',
    ticket.service_type ?? '',
    ticket.workzone ?? '',
    ticket.contact_phone ?? '',
    ticket.contact_name ?? '',
    ticket.customer_type ?? '',
    ticket.customer_name ?? '',
    ticket.service_no ?? '',
    ticket.symptom ?? '',
    ticket.device_name ?? '',
    latestStatus,
    ticket.jenis_tiket_1 ?? '',
    ticket.jenis_tiket_2 ?? '',
    ticket.gaul ?? '',
    ticket.durasi_ticket ?? '',
    ticket.status === 'closed' ? 'CLOSE' : 'OPEN',
    getMaxTtr(ticket),
    ticket.alamat ?? '',
    ticket.users?.nama ?? '',
    ticket.users?.username ?? '',
    ticket.status_update ?? '',
    ticket.description_solution_dompis ?? '',
    ticket.rca ?? '',
    ticket.sub_rca ?? '',
    formatDate(assignmentDate),
    formatDate(ticket.booking_date),
    formatDateTime(ticket.closed_at),
    ticket.reported_date ?? '',
  ];
}

function arrayToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
        return str;
      }).join(','),
    )
    .join('\n');
}

async function buildXlsx(data: string[][], columns: string[], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([columns, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Detail WO HI');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer;
  return new Blob([Uint8Array.from(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function GET(request: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin', 'super_admin']);
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get('format') ?? 'xlsx').toLowerCase();
    const dept = (searchParams.get('dept') ?? 'all') as string;
    const search = searchParams.get('search') ?? '';
    const searchType = parseSearchType(searchParams.get('searchType'));
    const workzone = searchParams.get('workzone') ?? '';
    const ctype = searchParams.get('ctype') ?? '';
    const status = searchParams.get('status') ?? 'all';
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const filenameBase = `Detail_WO_HI_${dateStr}`;
    const exportCacheKey = buildExportCacheKey(user.role, user.id_user, searchParams, format);

    if (exportCacheKey) {
      const cached = await getCache<{ kind: 'csv' | 'xlsx'; payload: string }>(exportCacheKey);
      if (cached) {
        if (cached.kind === 'csv') {
          return new Response(cached.payload, {
            headers: {
              'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
              'Content-Type': 'text/csv;charset=utf-8',
            },
          });
        }

        const buffer = Buffer.from(cached.payload, 'base64');
        return new Response(buffer, {
          headers: {
            'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        });
      }
    }

    const baseWhere = await DailyTicketService.buildDetailWoHiWhere(
      user.role, user.id_user, {
        dept: dept === 'all' ? undefined : dept,
        search: search || undefined,
        searchType,
        workzone: workzone || undefined,
        ctype: ctype || undefined,
        statusUpdate: status === 'assigned' ? 'assigned' : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    );
    const mainWhere = DailyTicketService.buildMainTableWhere(baseWhere);
    const statusWhere = buildStatusInseraWhere(status);
    const finalWhere = statusWhere
      ? { AND: [mainWhere, statusWhere] }
      : mainWhere;

    const total = await prisma.ticket.count({ where: finalWhere });

    if (total > DIRECT_EXPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          success: false,
          message: `Export terlalu besar (${total} row). Persempit filter sebelum export.`,
        },
        { status: 413 },
      );
    }

    if (total === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Tidak ada data untuk diexport.',
        },
        { status: 404 },
      );
    }

    const orderedTickets = await prisma.ticket.findMany({
      take: DIRECT_EXPORT_MAX_ROWS,
      where: finalWhere,
      orderBy: [{ reported_date: 'desc' }, { id_ticket: 'desc' }],
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

    const rows = orderedTickets.map((t: any) => {
      const latestStatus = t.status_update ?? '';
      const assignmentDate = t.ticket_tracking?.assigned_at ?? null;
      return buildDetailRow(t, latestStatus, assignmentDate);
    });

    if (format === 'csv') {
      const csvContent = arrayToCsv([DETAIL_COLUMNS, ...rows]);
      if (exportCacheKey) {
        await setCache(exportCacheKey, { kind: 'csv', payload: csvContent }, EXPORT_CACHE_TTL).catch(() => {});
      }
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      return new Response(blob, {
        headers: {
          'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
          'Content-Type': 'text/csv;charset=utf-8',
        },
      });
    }

    const blob = await buildXlsx(rows, DETAIL_COLUMNS, filenameBase);
    if (exportCacheKey) {
      const buffer = Buffer.from(await blob.arrayBuffer());
      await setCache(exportCacheKey, { kind: 'xlsx', payload: buffer.toString('base64') }, EXPORT_CACHE_TTL).catch(() => {});
      return new Response(buffer, {
        headers: {
          'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }
    return new Response(blob, {
      headers: {
        'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Export gagal') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
