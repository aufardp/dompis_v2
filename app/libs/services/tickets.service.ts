// app/services/ticket.service.ts

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { isAdminRole } from '@/app/libs/rolesUtil';
import {
  getWorkzonesForUser,
  resolveWorkzoneName,
} from '../../helpers/ticket.helpers';
import { TicketWorkflowService } from './ticketWorkflow.service';
import { ActorContext } from '@/app/types/ticket';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { differenceInCalendarDays, endOfDay, format, startOfDay, startOfMonth, subDays } from 'date-fns';
import { AttendanceService } from './attendance.service';
import { CUSTOMER_TYPES, getSlaHours } from '@/app/config/customer-types';
import { toWibString, toWibDateString, getTodayWibRange } from '@/lib/timezone';
import { resolveEffectiveFlagging } from '../flagging-manja';
import { normalizeSearchInput, type SearchType } from '@/lib/search-intent';

// ── Types ─────────────────────────────────────────────────────────────────────

import {
  getJenisWhereClause,
  JENIS_LABELS,
  normalizeJenis,
  type JenisKey,
} from '@/app/config/jenis-tiket';
import { classifyTicket } from '@/app/libs/tickets/jenis';

type TicketFilters = {
  search?: string;
  searchType?: SearchType;
  statusUpdate?: string;
  dept?: string;
  ticketType?: string;
  workzone?: number | string;
  ctype?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
};

function normalizeStatusUpdateFilter(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function buildTicketSearchWhere(
  search: string,
  searchType?: SearchType,
): Record<string, any> | null {
  const term = normalizeSearchInput(search);
  if (!term) return null;

  const isNumericLike = /^[\d\s+().-]+$/.test(term);
  const compactNumber = term.replace(/[^\d]/g, '');

  if (searchType === 'service' || (isNumericLike && compactNumber.length >= 4)) {
    return {
      OR: [
        { service_no: { equals: compactNumber } },
        { service_no: { startsWith: compactNumber } },
        { contact_phone: { startsWith: compactNumber } },
      ],
    };
  }

  const isTicketCodeLike = /^[a-z0-9_-]{3,}$/i.test(term) && !term.includes(' ');
  if (searchType === 'ticket_code' || isTicketCodeLike) {
    return {
      OR: [
        { incident: { equals: term } },
        { incident: { startsWith: term } },
        { ticket_id_gamas: { equals: term } },
        { ticket_id_gamas: { startsWith: term } },
      ],
    };
  }

  if (term.length >= 3) {
    return {
      OR: [
        { contact_name: { contains: term } },
        { customer_name: { contains: term } },
      ],
    };
  }

  return { incident: { equals: term } };
}

const ticketSearchSelect = {
  id_ticket: true,
  incident: true,
  contact_name: true,
  contact_phone: true,
  service_no: true,
  workzone: true,
  status_update: true,
} as const;

type SearchTicketRow = {
  id_ticket: number;
  incident: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  service_no: string | null;
  workzone: string | null;
  status_update: string | null;
};

function mapSearchTicketResult(t: SearchTicketRow) {
  return {
    idTicket: t.id_ticket,
    ticket: t.incident,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    serviceNo: t.service_no,
    workzone: t.workzone,
    hasilVisit: t.status_update,
  };
}

function uniqueSearchResults(rows: SearchTicketRow[]) {
  const seen = new Set<number>();
  const deduped: SearchTicketRow[] = [];

  for (const row of rows) {
    if (seen.has(row.id_ticket)) continue;
    seen.add(row.id_ticket);
    deduped.push(row);
  }

  return deduped;
}

function applyStatusUpdateWhere(
  where: Record<string, any>,
  statusUpdate?: string,
) {
  const su = normalizeStatusUpdateFilter(statusUpdate);
  if (!su || su === 'all') return;

  switch (su) {
    case 'open':
      where.OR = [{ status_update: null }, { status_update: 'open' }];
      break;

    case 'assigned':
      where.status_update = 'assigned';
      break;

    case 'on_progress':
      where.status_update = 'on_progress';
      break;

    case 'pending':
      where.status_update = 'pending';
      break;

    case 'close':
      where.status_update = 'close';
      break;

    default:
      // Fallback: try direct match
      where.status_update = su;
      break;
  }
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapTicket(t: any) {
  return {
    idTicket: t.id_ticket,
    ticket: t.incident,
    summary: t.summary,
    reportedDate: toWibString(t.reported_date),
    ownerGroup: t.owner_group,
    serviceType: t.service_type,
    customerType: t.customer_type,
    ctype: t.customer_type || undefined,
    serviceNo: t.service_no,
    ticketIdGamas: t.ticket_id_gamas ?? null,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    deviceName: t.device_name,
    status: t.status,
    statusDate: t.status_date,
    status_update: (() => {
      const v = String(t.status_update ?? '')
        .trim()
        .toLowerCase();
      return v || null;
    })(),
    hasilVisit: t.status_update,
    bookingDate: toWibString(t.booking_date),
    symptom: t.symptom,
    descriptionSolutionDompis: t.description_solution_dompis,
    workzone: t.workzone,
    customerSegment: t.customer_segment,
    sourceTicket: t.source_ticket,
    jenisTiket: t.jenis_tiket_2,
    flaggingManja: resolveEffectiveFlagging(t.flagging_manja, t.booking_date),
    guaranteeStatus: t.guarantee_status,
    maxTtrReguler: null,
    maxTtrGold: null,
    maxTtrPlatinum: null,
    maxTtrDiamond: null,
    pendingDompis: t.pending_dompis,
    teknisiUserId: t.teknisi_user_id,
    rca: t.rca,
    subRca: t.sub_rca,
    alamat: t.alamat,
    closedAt: toWibString(t.closed_at),
    syncedAt: toWibString(t.synced_at),
    technicianName: t.users?.nama,
    worklogSummary: t.worklog_summary,
  };
}

function buildTrendKeys(from: Date, to: Date, granularity: 'day' | 'month') {
  if (granularity === 'month') {
    const keys: string[] = [];
    const cursor = startOfMonth(from);
    const endMonth = startOfMonth(to);

    while (cursor <= endMonth) {
      keys.push(format(cursor, 'yyyy-MM'));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return keys;
  }

  const keys: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    keys.push(format(cursor, 'yyyy-MM-dd'));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function bucketAnalyticsType(group: {
  jenis_tiket_2: string | null;
  customer_segment: string | null;
  customer_type: string | null;
}) {
  const dept = classifyTicket({
    jenisTiket: group.jenis_tiket_2,
    customerSegment: group.customer_segment,
    customerType: group.customer_type,
  });

  if (dept === 'b2b') {
    const normalized = normalizeJenis(group.jenis_tiket_2);
    const allowed: JenisKey[] = [
      'sqm-ccan',
      'indibiz',
      'datin',
      'reseller',
      'wifi-id',
    ];

    if (normalized && (allowed as string[]).includes(normalized)) {
      return { key: normalized, label: JENIS_LABELS[normalized] ?? normalized };
    }

    return { key: 'other-b2b', label: 'Other (B2B)' };
  }

  const ctype = String(group.customer_type ?? '').trim().toUpperCase();

  if (ctype === 'REGULER') return { key: 'REG', label: 'REG' };
  if (ctype === 'HVC_GOLD') return { key: 'GOLD', label: 'GOLD' };
  if (ctype === 'HVC_PLATINUM') return { key: 'PLATINUM', label: 'PLATINUM' };
  if (ctype === 'HVC_DIAMOND') return { key: 'DIAMOND', label: 'DIAMOND' };

  return { key: 'other-b2c', label: 'OTHER' };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class TicketService {
  // ── Private Helpers ──────────────────────────────────────────────────────────

  private static applyDashboardFilters(
    where: Record<string, any>,
    opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
  ) {
    const dept = opts?.dept;
    const ticketType = opts?.ticketType;
    const statusUpdate = opts?.statusUpdate;

    if (statusUpdate && statusUpdate !== 'all') {
      applyStatusUpdateWhere(where, statusUpdate);
    }

    if (ticketType && ticketType !== 'all') {
      const jenisClause = getJenisWhereClause(ticketType);
      Object.assign(where, jenisClause);
    }

    if (dept && dept !== 'all') {
      const B2C_CTYPES = CUSTOMER_TYPES.map((ct) => ct.key);

      if (dept === 'b2c') {
        where.customer_type = { in: B2C_CTYPES };
      } else if (dept === 'b2b') {
        where.OR = [
          { customer_type: { notIn: B2C_CTYPES } },
          { customer_type: null },
        ];
      }
    }
  }

  private static async buildWorkzoneWhere(
    role: string,
    userId: number,
    selectedWorkzone?: string | null,
  ): Promise<Record<string, any>> {
    if (role === 'superadmin' || role === 'super_admin') {
      if (selectedWorkzone) {
        return { workzone: selectedWorkzone };
      }

      return {};
    }

    if (role === 'teknisi') {
      // ============================================================
      // DAILY-BASED FILTER LOGIC
      //Requirement:
      // - assigned → HARI INI saja (wajib hilang jika berganti hari)
      // - on_progress → HARI INI saja (wajib hilang jika berganti hari)
      // - pending → SEMUA (tetap muncul meski sudah berganti hari)
      // - close → SEMUA history (tetap muncul semua)
      // ============================================================

      // Get today's date range in WIB timezone
      const now = new Date();
      const wibNow = toZonedTime(now, 'Asia/Jakarta');
      const todayStart = startOfDay(wibNow);
      const todayEnd = endOfDay(wibNow);

      // Get ticket IDs that were assigned ON TODAY (using ticket_assignment_history)
      const todayAssignments = await prisma.ticket_assignment_history.findMany({
        where: {
          assigned_to: userId,
          assigned_at: {
            gte: todayStart,
            lte: todayEnd,
          },
          is_active: true,
        },
        select: { ticket_id: true },
      });
      const todayTicketIds = todayAssignments.map((a) => a.ticket_id);

      const where: Record<string, any> = {
        teknisi_user_id: userId,
        OR: [
          // assigned & on_progress: HANYA yang di-assign hari ini (berdasarkan assignment history)
          {
            AND: [
              { status_update: { in: ['assigned', 'on_progress'] } },
              {
                id_ticket:
                  todayTicketIds.length > 0
                    ? { in: todayTicketIds }
                    : { equals: -1 }, // No tickets if empty
              },
            ],
          },
          // pending: SEMUA (tidak dibatasi tanggal)
          { status_update: 'pending' },
          // close: SEMUA history
          { status_update: 'close' },
        ],
      };

      if (selectedWorkzone) {
        where.workzone = selectedWorkzone;
      }

      return where;
    }

    if (isAdminRole(role)) {
      const workzones = await getWorkzonesForUser(userId);

      if (workzones.length === 0) {
        return { id_ticket: 0 };
      }

      if (selectedWorkzone) {
        return workzones.includes(selectedWorkzone)
          ? { workzone: selectedWorkzone }
          : { id_ticket: 0 };
      }

      return { workzone: { in: workzones } };
    }

    return {};
  }

  /** Resolves a service-area ID to its workzone name, or null when invalid. */
  private static async resolveSelectedWorkzone(
    saId?: number | string,
  ): Promise<string | null> {
    const id = Number(saId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return resolveWorkzoneName(id);
  }

  private static async buildTicketWhere(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const {
      search = '',
      statusUpdate,
      dept,
      ticketType,
      workzone,
      ctype,
      startDate,
      endDate,
      searchType,
    } = filters ?? {};

    const selectedWorkzone = await this.resolveSelectedWorkzone(workzone);
    const where: Record<string, any> = {
      ...(await this.buildWorkzoneWhere(role, userId, selectedWorkzone)),
    };

    const andClauses: Record<string, any>[] = [];

    const searchWhere = buildTicketSearchWhere(search, searchType);
    if (searchWhere) {
      andClauses.push(searchWhere);
    }

    if (startDate || endDate) {
      if (startDate && endDate) {
        andClauses.push({
          reported_date: {
            gte: startDate,
            lte: `${endDate} 23:59:59`,
          },
        });
      } else if (startDate) {
        andClauses.push({
          reported_date: { gte: startDate },
        });
      } else if (endDate) {
        andClauses.push({
          reported_date: { lte: `${endDate} 23:59:59` },
        });
      }
    }

    if (statusUpdate) {
      const statusWhere: Record<string, any> = {};
      applyStatusUpdateWhere(statusWhere, statusUpdate);
      if (Object.keys(statusWhere).length > 0) {
        andClauses.push(statusWhere);
      }
    }

    if (ctype) {
      andClauses.push({ customer_type: ctype });
    }

    if (ticketType && ticketType !== 'all') {
      andClauses.push(getJenisWhereClause(ticketType));
    }

    if (dept && dept !== 'all') {
      const B2C_CTYPES = CUSTOMER_TYPES.map((ct) => ct.key);

      if (dept === 'b2c') {
        andClauses.push({
          customer_type: { in: B2C_CTYPES },
        });
      }

      if (dept === 'b2b') {
        andClauses.push({
          customer_type: { notIn: B2C_CTYPES },
        });
        andClauses.push({
          customer_segment: { notIn: ['PL-TSEL', 'DCS'] },
        });
      }
    }

    if (andClauses.length > 0) {
      where.AND = [...(where.AND ?? []), ...andClauses];
    }

    return where;
  }

  // ── Read ─────────────────────────────────────────────────────────────────────
  static async getTickets(
    role: string,
    userId: number,
    filters?: TicketFilters,
  ) {
    const {
      search = '',
      statusUpdate,
      dept,
      ticketType,
      workzone,
      ctype,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = 'desc',
    } = filters ?? {};

    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;
    const where = await this.buildTicketWhere(role, userId, {
      search,
      statusUpdate,
      dept,
      ticketType,
      workzone,
      ctype,
      startDate,
      endDate,
    });

    /* QUERY DATABASE */

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),

      prisma.ticket.findMany({
        where,

        select: {
          id_ticket: true,
          incident: true,
          summary: true,
          reported_date: true,
          owner_group: true,
          service_type: true,
          service_no: true,
          contact_name: true,
          contact_phone: true,
          booking_date: true,
          workzone: true,
          customer_type: true,
          customer_segment: true,
          jenis_tiket_2: true,
          flagging_manja: true,
          guarantee_status: true,
          status_update: true,
          status_date: true,
          status: true,
          worklog_summary: true,
          symptom: true,
          alamat: true,
          device_name: true,
          pending_dompis: true,
          source_ticket: true,
          description_solution_dompis: true,
          rca: true,
          sub_rca: true,
          closed_at: true,
          teknisi_user_id: true,
          ticket_id_gamas: true,
          users: {
            select: {
              nama: true,
            },
          },
        },

        orderBy: [{ reported_date: sort }, { id_ticket: 'asc' }],

        skip: offset,
        take: safeLimit,
      }),
    ]);

    return {
      total,
      page: safePage,
      limit: safeLimit,

      totalPages: Math.ceil(total / safeLimit),

      data: tickets.map(mapTicket),
    };
  }

  static async getSemestaAnalyticsV2(
    role: string,
    userId: number,
    filters?: {
      startDate?: string;
      endDate?: string;
      workzone?: string;
      dept?: string;
      ticketType?: string;
    },
  ) {
    const where = await this.buildTicketWhere(role, userId, {
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      workzone: filters?.workzone,
      dept: filters?.dept,
      ticketType: filters?.ticketType,
    });

    const B2C_SEGMENTS = new Set(['DCS', 'PL-TSEL']);
    const isB2C = (seg: string | null | undefined) => B2C_SEGMENTS.has(seg ?? '');

    // --- DATE RANGE SETUP ---
    const rangeFrom = filters?.startDate
      ? startOfDay(new Date(`${filters.startDate}T00:00:00`))
      : startOfDay(subDays(new Date(), 29));

    const rangeTo = filters?.endDate
      ? endOfDay(new Date(`${filters.endDate}T00:00:00`))
      : endOfDay(new Date());

    const spanDays = differenceInCalendarDays(rangeTo, rangeFrom) + 1;
    const granularity: 'day' | 'month' = spanDays > 60 ? 'month' : 'day';

    // --- QUERY 1: Main groupBy ---
    const groups = await prisma.ticket.groupBy({
      where,
      by: ['workzone', 'jenis_tiket_2', 'customer_segment', 'ticket_id_gamas', 'reported_date', 'status_update'],
      _count: { _all: true },
    });

    // --- WORKZONE FILTER for raw SQL queries ---
    const workzoneFilter = await (async (): Promise<{
      gaul: Prisma.Sql;
      lapul: Prisma.Sql;
      skip: boolean;
    }> => {
      const noAccess = { gaul: Prisma.sql``, lapul: Prisma.sql``, skip: true };

      if (role === 'superadmin' || role === 'super_admin') {
        if (filters?.workzone) {
          const eq = Prisma.sql`= ${filters.workzone}`;
          return {
            gaul: Prisma.sql`AND t1.workzone ${eq}`,
            lapul: Prisma.sql`AND t.workzone ${eq}`,
            skip: false,
          };
        }
        return { gaul: Prisma.sql``, lapul: Prisma.sql``, skip: false };
      }

      const userWorkzones = await getWorkzonesForUser(userId);
      if (userWorkzones.length === 0) return noAccess;

      if (filters?.workzone) {
        if (userWorkzones.includes(filters.workzone)) {
          const eq = Prisma.sql`= ${filters.workzone}`;
          return {
            gaul: Prisma.sql`AND t1.workzone ${eq}`,
            lapul: Prisma.sql`AND t.workzone ${eq}`,
            skip: false,
          };
        }
        return noAccess;
      }

      const inClause = Prisma.sql`IN (${Prisma.join(userWorkzones)})`;
      return {
        gaul: Prisma.sql`AND t1.workzone ${inClause}`,
        lapul: Prisma.sql`AND t.workzone ${inClause}`,
        skip: false,
      };
    })();

    // --- QUERY 2: GAUL detection ---
    let gaulRows: Array<{
      service_no: string;
      occurrences: bigint;
      workzone: string | null;
      last_incident: string;
      last_date: string;
    }> = [];
    let gaulError = false;

    if (!workzoneFilter.skip) {
      try {
        gaulRows = await prisma.$queryRaw`
          SELECT
            t1.service_no,
            COUNT(DISTINCT t1.incident) AS occurrences,
            t1.workzone,
            MAX(t1.incident) AS last_incident,
            MAX(t1.reported_date) AS last_date
          FROM ticket t1
          WHERE t1.service_no IS NOT NULL
            AND t1.service_no != ''
            AND t1.service_no != 'NN'
            AND t1.reported_date >= ${format(rangeFrom, 'yyyy-MM-dd')}
            AND t1.reported_date <= ${format(rangeTo, 'yyyy-MM-dd')}
            ${workzoneFilter.gaul}
            AND EXISTS (
              SELECT 1 FROM ticket t2
              WHERE t2.service_no = t1.service_no
                AND t2.incident != t1.incident
                AND ABS(DATEDIFF(t2.reported_date, t1.reported_date)) <= 60
                AND t2.reported_date >= ${format(rangeFrom, 'yyyy-MM-dd')}
                AND t2.reported_date <= ${format(rangeTo, 'yyyy-MM-dd')}
            )
          GROUP BY t1.service_no, t1.workzone
          ORDER BY occurrences DESC
          LIMIT 100
        `;
        gaulRows = gaulRows.filter(r => r.service_no !== 'NN');
      } catch {
        gaulError = true;
      }
    }

    // --- QUERY 3: LAPUL detection ---
    let lapulRows: Array<{
      incident: string;
      occurrences: bigint;
      workzone: string | null;
      first_date: string | Date;
    }> = [];
    let lapulError = false;

    if (!workzoneFilter.skip) {
      try {
        lapulRows = await prisma.$queryRaw`
          SELECT
            tr.incident,
            COUNT(*) AS occurrences,
            t.workzone,
            MIN(tr.importedAt) AS first_date
          FROM ticket_raw tr
          INNER JOIN ticket t ON t.incident = tr.incident
          WHERE tr.importedAt >= ${rangeFrom}
            AND tr.importedAt <= ${rangeTo}
            ${workzoneFilter.lapul}
          GROUP BY tr.incident, t.workzone
          HAVING COUNT(*) > 1
            AND DATEDIFF(MAX(tr.importedAt), MIN(tr.importedAt)) <= 60
          ORDER BY occurrences DESC
          LIMIT 100
        `;
      } catch {
        lapulError = true;
      }
    }

    // --- APPLICATION LAYER PROCESSING ---
    const kpi = { total: 0, open: 0, onProgress: 0, closed: 0, gaul: 0, lapul: 0, gamas: 0, unspec: 0, unspecB2b: 0, sqm: 0, sqmCcan: 0 };

    const trendByJenisMap = new Map<string, Record<string, number>>();
    const jenisTotals = new Map<string, number>();
    const trendByDeptMap = new Map<string, { b2c: number; b2b: number }>();
    const workzoneMap = new Map<string, { total: number; gamas: number; sqm: number; sqmCcan: number; unspec: number; unspecB2b: number }>();

    const JENIS_LABEL: Record<string, string> = {
      '': 'Unknown',
      reguler: 'Reguler',
      customer: 'Customer',
      sqm: 'SQM',
      'sqm-ccan': 'SQM-CCAN',
      unspec: 'Unspec',
    };

    for (const g of groups) {
      const count = g._count._all;
      const rawJenis = (g.jenis_tiket_2 ?? '').trim();
      const jenisLower = rawJenis.toLowerCase();
      const jenisLabel = JENIS_LABEL[jenisLower] || rawJenis || 'Unknown';
      const segment = g.customer_segment ?? null;
      const workzone = g.workzone ?? 'Unknown';
      const hasGamas = Boolean(g.ticket_id_gamas && g.ticket_id_gamas !== '');
      const status = (g.status_update ?? '').toLowerCase().trim();
      const reportedDate = g.reported_date ? String(g.reported_date).slice(0, 10) : null;

      kpi.total += count;
      if (status === 'close' || status === 'closed') kpi.closed += count;
      else if (!status || status === 'open') kpi.open += count;
      else kpi.onProgress += count;
      if (hasGamas) kpi.gamas += count;

      const isUnspec = jenisLower === 'unspec';
      const isSqm = jenisLower === 'sqm';
      const isSqmCcan = jenisLower === 'sqm-ccan';
      const isDigitalSpbu = jenisLower === 'digital_spbu' || jenisLower === 'digital spbu';
      const b2cTicket = isB2C(segment);

      if (isUnspec && b2cTicket) kpi.unspec += count;
      if (isUnspec && !b2cTicket) kpi.unspecB2b += count;
      if (isSqm) kpi.sqm += count;
      if (isSqmCcan) kpi.sqmCcan += count;

      // Skip digital_spbu from trend chart
      if (isDigitalSpbu) {
        if (!workzoneMap.has(workzone)) {
          workzoneMap.set(workzone, { total: 0, gamas: 0, sqm: 0, sqmCcan: 0, unspec: 0, unspecB2b: 0 });
        }
        const wz = workzoneMap.get(workzone)!;
        wz.total += count;
        if (hasGamas) wz.gamas += count;
        if (isSqm) wz.sqm += count;
        if (isSqmCcan) wz.sqmCcan += count;
        if (isUnspec && b2cTicket) wz.unspec += count;
        if (isUnspec && !b2cTicket) wz.unspecB2b += count;
        continue;
      }

      if (reportedDate) {
        const trendKey = granularity === 'month' ? reportedDate.slice(0, 7) : reportedDate;

        if (!trendByJenisMap.has(trendKey)) {
          trendByJenisMap.set(trendKey, {});
        }
        const entry = trendByJenisMap.get(trendKey)!;
        entry[jenisLabel] = (entry[jenisLabel] ?? 0) + count;
        jenisTotals.set(jenisLabel, (jenisTotals.get(jenisLabel) ?? 0) + count);

        if (!trendByDeptMap.has(trendKey)) {
          trendByDeptMap.set(trendKey, { b2c: 0, b2b: 0 });
        }
        const deptEntry = trendByDeptMap.get(trendKey)!;
        if (b2cTicket) deptEntry.b2c += count;
        else deptEntry.b2b += count;
      }

      if (!workzoneMap.has(workzone)) {
        workzoneMap.set(workzone, { total: 0, gamas: 0, sqm: 0, sqmCcan: 0, unspec: 0, unspecB2b: 0 });
      }
      const wz = workzoneMap.get(workzone)!;
      wz.total += count;
      if (hasGamas) wz.gamas += count;
      if (isSqm) wz.sqm += count;
      if (isSqmCcan) wz.sqmCcan += count;
      if (isUnspec && b2cTicket) wz.unspec += count;
      if (isUnspec && !b2cTicket) wz.unspecB2b += count;
    }

    // Merge rare jenis types into Others (keep top 6 by volume)
    const MAX_JENIS_CATEGORIES = 6;
    const sortedJenis = [...jenisTotals.entries()].sort((a, b) => b[1] - a[1]);
    const topJenis = new Set(sortedJenis.slice(0, MAX_JENIS_CATEGORIES).map(([k]) => k));
    for (const trendEntry of trendByJenisMap.values()) {
      let others = 0;
      for (const [key, val] of Object.entries(trendEntry)) {
        if (!topJenis.has(key)) {
          others += val;
          delete trendEntry[key];
        }
      }
      if (others > 0) trendEntry.Others = (trendEntry.Others ?? 0) + others;
    }

    kpi.gaul = gaulRows.reduce((sum, r) => sum + Number(r.occurrences), 0);
    kpi.lapul = lapulRows.reduce((sum, r) => sum + Number(r.occurrences), 0);

    const gaulByWorkzone = new Map<string, number>();
    const lapulByWorkzone = new Map<string, number>();
    for (const r of gaulRows) {
      const wz = r.workzone ?? 'Unknown';
      gaulByWorkzone.set(wz, (gaulByWorkzone.get(wz) ?? 0) + Number(r.occurrences));
    }
    for (const r of lapulRows) {
      const wz = r.workzone ?? 'Unknown';
      lapulByWorkzone.set(wz, (lapulByWorkzone.get(wz) ?? 0) + Number(r.occurrences));
    }

    const byWorkzone = Array.from(workzoneMap.entries())
      .map(([workzone, data]) => ({
        workzone,
        ...data,
        gaul: gaulByWorkzone.get(workzone) ?? 0,
        lapul: lapulByWorkzone.get(workzone) ?? 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const allDates = buildTrendKeys(rangeFrom, rangeTo, granularity);

    const allJenisKeys = [...new Set([...trendByJenisMap.values()].flatMap(Object.keys))];
    const emptyJenisRow = Object.fromEntries(allJenisKeys.map(k => [k, 0]));
    const trendByJenis = allDates.map(date => ({
      date,
      ...emptyJenisRow,
      ...(trendByJenisMap.get(date) ?? {}),
    }));

    const trendByDept = allDates.map(date => ({
      date,
      ...(trendByDeptMap.get(date) ?? { b2c: 0, b2b: 0 }),
    }));

    // Build gaul trend per date
    const gaulByDate = new Map<string, number>();
    for (const r of gaulRows) {
      const d = String(r.last_date ?? '').slice(0, 10);
      if (d) gaulByDate.set(d, (gaulByDate.get(d) ?? 0) + Number(r.occurrences));
    }
    const trendGaul = allDates.map(date => ({
      date,
      count: gaulByDate.get(date) ?? 0,
    }));

    // Build lapul trend per date
    const lapulByDate = new Map<string, number>();
    for (const r of lapulRows) {
      const d = typeof r.first_date === 'string' ? r.first_date.slice(0, 10) : String(r.first_date ?? '').slice(0, 10);
      if (d) lapulByDate.set(d, (lapulByDate.get(d) ?? 0) + Number(r.occurrences));
    }
    const trendLapul = allDates.map(date => ({
      date,
      count: lapulByDate.get(date) ?? 0,
    }));

    return {
      kpi,
      trendByJenis,
      trendByDept,
      trendGaul,
      trendLapul,
      byWorkzone,
      topGaulServices: gaulRows.slice(0, 10).map(r => ({
        service_no: r.service_no,
        occurrences: Number(r.occurrences),
        workzone: r.workzone ?? '',
        lastIncident: r.last_incident,
        lastDate: r.last_date,
      })),
      topLapulIncidents: lapulRows.slice(0, 10).map(r => ({
        incident: r.incident,
        occurrences: Number(r.occurrences),
        workzone: r.workzone ?? '',
        firstDate: typeof r.first_date === 'string' ? r.first_date : r.first_date?.toISOString?.() ?? '',
      })),
      dateRange: { from: format(rangeFrom, 'yyyy-MM-dd'), to: format(rangeTo, 'yyyy-MM-dd') },
      granularity,
      truncated: gaulError || lapulError,
    };
  }

  static async getSemestaAnalytics(
    role: string,
    userId: number,
    filters?: Omit<TicketFilters, 'page' | 'limit' | 'sort'>,
  ) {
    const where = await this.buildTicketWhere(role, userId, filters);
    const hasExplicitDateRange = Boolean(filters?.startDate && filters?.endDate);
    const now = new Date();
    const rangeFrom =
      hasExplicitDateRange && filters?.startDate
        ? startOfDay(new Date(`${filters.startDate}T00:00:00`))
        : startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const rangeTo =
      hasExplicitDateRange && filters?.endDate
        ? endOfDay(new Date(`${filters.endDate}T00:00:00`))
        : endOfDay(now);
    const spanDays = Math.max(
      1,
      differenceInCalendarDays(rangeTo, rangeFrom) + 1,
    );
    const granularity: 'day' | 'month' =
      hasExplicitDateRange && spanDays > 31 ? 'month' : 'day';
    const trendKeys = buildTrendKeys(rangeFrom, rangeTo, granularity);
    const trendMap = new Map<string, number>(trendKeys.map((key) => [key, 0]));
    const typeMap = new Map<string, { key: string; label: string; count: number }>();
    const workzoneMap = new Map<string, number>();
    const metrics = { total: 0, open: 0, onProgress: 0, closed: 0 };

    const groups = await prisma.ticket.groupBy({
      where,
      by: [
        'status_update',
        'workzone',
        'customer_type',
        'customer_segment',
        'jenis_tiket_2',
        'reported_date',
      ],
      _count: {
        _all: true,
      },
    });

    for (const group of groups) {
      const count = group._count._all;
      const status = String(group.status_update ?? '').trim().toLowerCase();
      const typeBucket = bucketAnalyticsType(group);
      const workzoneName = String(group.workzone ?? '').trim() || 'Unknown';

      metrics.total += count;

      if (status === 'close') {
        metrics.closed += count;
      } else if (status === '' || status === 'open') {
        metrics.open += count;
      } else {
        metrics.onProgress += count;
      }

      const existingType = typeMap.get(typeBucket.key);
      if (existingType) {
        existingType.count += count;
      } else {
        typeMap.set(typeBucket.key, { ...typeBucket, count });
      }

      workzoneMap.set(workzoneName, (workzoneMap.get(workzoneName) ?? 0) + count);

      if (!group.reported_date) continue;

      const reportedAt = new Date(group.reported_date);
      if (Number.isNaN(reportedAt.getTime())) continue;
      if (reportedAt < rangeFrom || reportedAt > rangeTo) continue;

      const trendKey =
        granularity === 'month'
          ? format(reportedAt, 'yyyy-MM')
          : format(reportedAt, 'yyyy-MM-dd');

      if (trendMap.has(trendKey)) {
        trendMap.set(trendKey, (trendMap.get(trendKey) ?? 0) + count);
      }
    }

    const byType = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);
    const workzonesSorted = Array.from(workzoneMap.entries())
      .map(([workzoneName, count]) => ({ workzone: workzoneName, count }))
      .sort((a, b) => b.count - a.count);
    const topWorkzones = workzonesSorted.slice(0, 8);
    const remainingWorkzones = workzonesSorted.slice(8);
    const remainingCount = remainingWorkzones.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const byWorkzone =
      remainingCount > 0
        ? [...topWorkzones, { workzone: 'Others', count: remainingCount }]
        : topWorkzones;
    const trend = trendKeys.map((key) => ({
      key,
      label:
        granularity === 'month'
          ? format(new Date(`${key}-01T00:00:00`), 'MMM yyyy')
          : hasExplicitDateRange
            ? format(new Date(`${key}T00:00:00`), 'MMM dd')
            : format(new Date(`${key}T00:00:00`), 'EEE'),
      count: trendMap.get(key) ?? 0,
    }));

    return {
      metrics,
      byType,
      byWorkzone,
      trend,
      truncated: false,
    };
  }

  static async getUnassignedTickets(role: string, userId: number) {
    // Only admin roles can see unassigned tickets
    if (!isAdminRole(role)) return [];

    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const where = {
      ...roleWhere,
      teknisi_user_id: null,
      OR: [{ status_update: null }, { status_update: { not: 'close' } }],
    };

    return prisma.ticket.findMany({
      where,
      orderBy: { reported_date: 'desc' },
      take: 200,
      select: {
        id_ticket: true,
        incident: true,
        summary: true,
        reported_date: true,
        workzone: true,
        contact_name: true,
        contact_phone: true,
        service_no: true,
        status_update: true,
        customer_type: true,
        teknisi_user_id: true,
      },
    });
  }

  static async search(incident: string, role: string, userId: number) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const term = normalizeSearchInput(incident);
    if (!term) return [];

    const compactNumber = term.replace(/[^\d]/g, '');
    const querySpecs: Array<Record<string, any>> = [{ incident: { equals: term } }];

    if (term.length >= 3) {
      querySpecs.push({ incident: { startsWith: term } });
    }

    querySpecs.push({ service_no: { equals: term } });
    querySpecs.push({ ticket_id_gamas: { equals: term } });

    if (term.length >= 3) {
      querySpecs.push({ service_no: { startsWith: term } });
      querySpecs.push({ ticket_id_gamas: { startsWith: term } });
    }

    if (compactNumber.length >= 4) {
      querySpecs.push({ service_no: { equals: compactNumber } });
      querySpecs.push({ service_no: { startsWith: compactNumber } });
      querySpecs.push({ contact_phone: { startsWith: compactNumber } });
    }

    if (term.length >= 3 && !/^[\d\s+().-]+$/.test(term)) {
      querySpecs.push({ contact_name: { contains: term } });
      querySpecs.push({ customer_name: { contains: term } });
    }

    const results: SearchTicketRow[] = [];
    for (const queryWhere of querySpecs) {
      if (results.length >= 20) break;

      const rows = await prisma.ticket.findMany({
        where: {
          ...roleWhere,
          ...queryWhere,
        },
        orderBy: { id_ticket: 'desc' },
        take: 20,
        select: ticketSearchSelect,
      });

      results.push(...rows);
    }

    return uniqueSearchResults(results)
      .slice(0, 20)
      .map(mapSearchTicketResult);
  }

  static async searchByContactName(
    contactName: string,
    role: string,
    userId: number,
  ) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const term = normalizeSearchInput(contactName);
    const where =
      term.length >= 3
        ? { ...roleWhere, contact_name: { contains: term } }
        : { ...roleWhere, contact_name: { equals: term } };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
      select: ticketSearchSelect,
    });

    return tickets.map(mapSearchTicketResult);
  }

  static async searchByServiceNo(
    serviceNo: string,
    role: string,
    userId: number,
  ) {
    const roleWhere = await this.buildWorkzoneWhere(role, userId);
    const term = normalizeSearchInput(serviceNo);
    const compactNumber = term.replace(/[^\d]/g, '');
    const matchTerm = compactNumber.length >= 4 ? compactNumber : term;
    const where = {
      ...roleWhere,
      OR: [
        { service_no: { equals: matchTerm } },
        { service_no: { startsWith: matchTerm } },
      ],
    };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 20,
      select: ticketSearchSelect,
    });

    return tickets.map(mapSearchTicketResult);
  }

  static async getTicketsByUser(userId: number) {
    const saNames = await getWorkzonesForUser(userId);

    const tickets = await prisma.ticket.findMany({
      where: { workzone: { in: saNames } },
      orderBy: [{ reported_date: 'desc' }, { id_ticket: 'desc' }],
      take: 200,
      select: {
        id_ticket: true,
        incident: true,
        summary: true,
        reported_date: true,
        workzone: true,
        status_update: true,
        teknisi_user_id: true,
      },
    });

    return tickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      summary: t.summary,
      reportedDate: t.reported_date,
      workzone: t.workzone,
      hasilVisit: t.status_update,
      teknisiUserId: t.teknisi_user_id,
    }));
  }

  static async getTeknisiUsers() {
    return prisma.users.findMany({
      where: { roles: { key: 'teknisi' } },
      select: { id_user: true, nama: true, nik: true },
      orderBy: { nama: 'asc' },
    });
  }

  static async getCustomerType() {
    const tickets = await prisma.ticket.findMany({
      select: { customer_type: true },
      distinct: ['customer_type'],
      where: { customer_type: { not: null } },
      orderBy: { customer_type: 'asc' },
    });

    return tickets.map((t: any) => ({ customerType: t.customer_type }));
  }

  // ── Workflow Delegation ───────────────────────────────────────────────────────

  static async assignToUser(
    ticketId: number,
    teknisiUserId: number,
    actor: ActorContext,
  ) {
    return TicketWorkflowService.assignToUser(ticketId, teknisiUserId, actor);
  }

  static async unassign(ticketId: number, role?: string, userId?: number) {
    if (!role || !userId) throw new Error('Unauthorized');
    return TicketWorkflowService.unassignTicket(ticketId, {
      id_user: userId,
      role,
    });
  }

  static async pickup(ticketId: number, teknisiUserId: number) {
    return TicketWorkflowService.pickupTicket(ticketId, {
      id_user: teknisiUserId,
      role: 'teknisi',
    });
  }

  static async close(
    ticketId: number,
    teknisiUserId: number,
    rca: string,
    subRca: string,
    descriptionSolutionDompis: string,
  ) {
    return TicketWorkflowService.closeTicket(
      ticketId,
      { id_user: teknisiUserId, role: 'teknisi' },
      rca,
      subRca,
      descriptionSolutionDompis,
    );
  }

  static async update(
    ticketId: number,
    teknisiUserId: number,
    description?: string,
    resume?: boolean,
  ) {
    const actor: ActorContext = { id_user: teknisiUserId, role: 'teknisi' };

    if (resume) {
      return TicketWorkflowService.updateTicket(ticketId, actor, {
        workflow: { status: 'ON_PROGRESS', note: 'Resume work' },
      });
    }

    const cleanDescription = String(description ?? '').trim();
    if (!cleanDescription) throw new Error('Description is required');

    return TicketWorkflowService.updateTicket(ticketId, actor, {
      workflow: {
        status: 'PENDING',
        pendingDompis: cleanDescription,
        note: 'Progress update',
      },
    });
  }

  // ── Expired Tickets ─────────────────────────────────────────────────────

  static async getExpiredTickets(
    role: string,
    userId: number,
    saId?: number,
    opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
  ) {
    const selectedWorkzone = await this.resolveSelectedWorkzone(saId);
    const baseWhere = await this.buildWorkzoneWhere(
      role,
      userId,
      selectedWorkzone,
    );

    this.applyDashboardFilters(baseWhere, opts);

    const now = new Date();
    const slaExpiredWhere = {
      ...baseWhere,
      OR: [{ status_update: null }, { status_update: { not: 'close' } }],
      reported_date: {
        not: null,
      },
    };

    const tickets = await prisma.ticket.findMany({
      where: slaExpiredWhere,
      select: {
        id_ticket: true,
        incident: true,
        customer_type: true,
        reported_date: true,
        status_update: true,
        teknisi_user_id: true,
        workzone: true,
        contact_name: true,
        service_no: true,
        users: { select: { nama: true } },
      },
      orderBy: { reported_date: 'asc' },
      take: 500,
    });

    // ── SLA-based filtering happens after fetch ─────────────────────
    const expiredTickets = tickets.filter((ticket: any) => {
      if (!ticket.reported_date) return false;
      const slaHours = getSlaHours(ticket.customer_type);
      const reportedDate = new Date(ticket.reported_date);
      const hoursElapsed =
        (now.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);
      return hoursElapsed > slaHours;
    });

    return expiredTickets.map((t: any) => ({
      idTicket: t.id_ticket,
      ticket: t.incident,
      customerType: t.customer_type,
      reportedDate: t.reported_date,
      status: t.status_update,
      technicianName: t.users?.nama,
      teknisiUserId: t.teknisi_user_id,
      workzone: t.workzone,
      contactName: t.contact_name,
      serviceNo: t.service_no,
    }));
  }
}
