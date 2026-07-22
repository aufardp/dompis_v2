import { NextRequest, NextResponse } from 'next/server';
import { getOrSetCache } from '@/lib/cache';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { logger } from '@/lib/observability/logger';
import { getErrorMessage } from '@/app/libs/apiError';
import type { KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import type {
  DurasiBucketKey,
  DurasiDetailMeta,
  DurasiDetailResponse,
  DurasiDetailTicket,
  DurasiPanelType,
} from '@/app/components/dashboard/durasi/durasi-types';
import {
  bucketIndexForPanel,
  bucketLabelFor,
  calculateDurationHours,
  matchesDurasiPanel,
  panelLabel,
  normalizeText,
} from '../durasi-logic';

const BUCKET_FILTERS: Record<KpiBucketKey, any[]> = {
  kpi_customer: [{ dept: 'all', operationalBucket: ['kpi_customer'] }],
  kpi_proactive: [{ dept: 'all', operationalBucket: ['kpi_proactive'] }],
  non_kpi_unspec: [{ dept: 'all', operationalBucket: ['non_kpi_unspec'] }],
  non_technical: [{ dept: 'all', operationalBucket: ['non_technical'] }],
  sqm_update: [{ dept: 'all', operationalBucket: ['sqm_update'] }],
  obsolete: [{ dept: 'all', operationalBucket: ['obsolete'] }],
  all: [
    { dept: 'all', operationalBucket: ['kpi_customer'] },
    { dept: 'all', operationalBucket: ['kpi_proactive'] },
    { dept: 'all', operationalBucket: ['non_kpi_unspec'] },
    { dept: 'all', operationalBucket: ['non_technical'] },
    { dept: 'all', operationalBucket: ['sqm_update'] },
    { dept: 'all', operationalBucket: ['obsolete'] },
  ],
};

function bucketDisplayLabel(bucket: DurasiBucketKey): string {
  const labels: Record<DurasiBucketKey, string> = {
    all: 'All',
    kpi_customer: 'Customer',
    kpi_proactive: 'Proactive',
    non_kpi_unspec: 'Unspec',
    non_technical: 'Non Technical',
    sqm_update: 'SQM Update',
    obsolete: 'Obsolete',
  };
  return labels[bucket];
}

async function fetchAllTickets(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
  visibleWorkzones: Set<string> | null,
): Promise<DurasiDetailTicket[]> {
  const filtersList = BUCKET_FILTERS[bucket];
  const ids = new Set<number>();
  const rows: DurasiDetailTicket[] = [];

  for (const filters of filtersList) {
    const [whereClause, params] = await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      ...filters,
      includeClosed: true,
    });
    const sql = `
      SELECT /*+ MAX_EXECUTION_TIME(15000) */
        t.id_ticket,
        t.incident,
        t.summary,
        t.reported_date,
        t.status,
        t.status_update,
        t.customer_type,
        t.jenis_tiket_1,
        t.jenis_tiket_2,
        t.guarantee_status,
        t.flagging_manja,
        t.manja_expired,
        t.ticket_id_gamas,
        t.workzone,
        COALESCE(a.nama_area, 'UNKNOWN') AS area,
        COALESCE(r.nama_region, 'UNKNOWN') AS region,
        t.closed_at,
        u.nama AS teknisi_name
      FROM ticket t
      LEFT JOIN users u ON u.id_user = t.teknisi_user_id
      LEFT JOIN service_area sa ON sa.nama_sa = t.workzone
      LEFT JOIN area a ON a.id_area = sa.area_id
      LEFT JOIN branch b ON b.id_branch = a.branch_id
      LEFT JOIN region r ON r.id_region = b.region_id
      WHERE ${whereClause}
      ORDER BY t.reported_date DESC, t.id_ticket DESC
    `;
    const result = await prisma.$queryRawUnsafe<DurasiDetailTicket[]>(sql, ...params);
    for (const row of result) {
      if (visibleWorkzones && row.workzone && !visibleWorkzones.has(row.workzone)) continue;
      if (ids.has(row.id_ticket)) continue;
      ids.add(row.id_ticket);
      rows.push(row);
    }
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';
    const visibleWorkzones = isSuperAdmin ? null : new Set(await getWorkzonesForUser(decoded.id_user));

    const requestedBucket = request.nextUrl.searchParams.get('bucket') ?? 'all';
    const bucket: KpiBucketKey = requestedBucket in BUCKET_FILTERS ? (requestedBucket as KpiBucketKey) : 'all';
    const panelType = (request.nextUrl.searchParams.get('panelType') ?? 'REGULER') as DurasiPanelType;
    const area = String(request.nextUrl.searchParams.get('area') ?? '').trim();
    const sa = String(request.nextUrl.searchParams.get('sa') ?? '').trim();
    const bucketIndex = Number(request.nextUrl.searchParams.get('bucketIndex') ?? '0');
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1);
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '20') || 20));

    const cacheKey = `dashboard:durasi:detail:${decoded.role}:${decoded.id_user}:${bucket}:${panelType}:${area || 'all'}:${sa || 'all'}:${bucketIndex}:${page}:${limit}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const allTickets = await fetchAllTickets(decoded.role, decoded.id_user, bucket, visibleWorkzones);

      const filtered = allTickets.filter((ticket) => {
        if (area && normalizeText(ticket.area) !== normalizeText(area)) return false;
        if (sa && normalizeText(ticket.workzone) !== normalizeText(sa)) return false;
        if (!matchesDurasiPanel(ticket, panelType)) return false;
        return bucketIndexForPanel(ticket, panelType) === bucketIndex;
      });

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * limit;
      const pageItems = filtered.slice(start, start + limit);

      const items = pageItems.map((ticket) => {
        const durationHours = calculateDurationHours(ticket.reported_date);
        const durationIndex = bucketIndexForPanel(ticket, panelType);
        return {
          id_ticket: ticket.id_ticket,
          incident: ticket.incident,
          summary: ticket.summary,
          reported_date: ticket.reported_date,
          status: ticket.status,
          status_update: ticket.status_update,
          customer_type: ticket.customer_type,
          jenis_tiket_1: ticket.jenis_tiket_1,
          jenis_tiket_2: ticket.jenis_tiket_2,
          guarantee_status: ticket.guarantee_status,
          flagging_manja: ticket.flagging_manja,
          manja_expired: ticket.manja_expired,
          ticket_id_gamas: ticket.ticket_id_gamas,
          workzone: ticket.workzone,
          area: ticket.area,
          region: ticket.region,
          closed_at: ticket.closed_at,
          teknisi_name: ticket.teknisi_name,
          duration_hours: durationHours,
          source_panel: panelType,
          duration_bucket: bucketLabelFor(panelType, durationIndex),
        };
      });

      const meta: DurasiDetailMeta = {
        bucket,
        bucketLabel: bucketDisplayLabel(bucket),
        panelType,
        panelLabel: panelLabel(panelType),
        area,
        sa: sa || null,
        bucketIndex,
        bucketName: bucketLabelFor(panelType, bucketIndex),
        page: safePage,
        limit,
        total,
        hasMore: safePage * limit < total,
      };

      const payload: DurasiDetailResponse = {
        meta,
        tickets: items,
      };
      return payload;
    }, 20);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    logger.error('Dashboard durasi detail error:', error);
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ success: false, message: getErrorMessage(error, 'Unauthorized') }, { status: error.status });
    }
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Internal server error') },
      { status: 500 },
    );
  }
}
