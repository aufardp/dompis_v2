import { NextRequest, NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { getOrSetCache } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { resolveBranchScope, getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { toWibString, toWibDateString } from '@/lib/timezone';
import { logger } from '@/lib/observability/logger';
import { buildCellFilterSql } from '@/lib/rekap/rekap-cell-filter';

interface RekapMemberTicketRow {
  id_ticket: number;
  incident: string;
  summary: string | null;
  reported_date: string | null;
  status: string | null;
  status_update: string | null;
  customer_type: string | null;
  customer_segment: string | null;
  customer_name: string | null;
  service_no: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  source_ticket: string | null;
  workzone: string | null;
  area: string;
  sa_name: string;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
  classification_path: string | null;
  classification_flag: string | null;
  closed_at: Date | null;
  sync_date: Date | null;
}

interface RekapMembersMeta {
  bucket: string;
  detail: string | null;
  status: string;
  legacyCustomer: boolean;
  area: string | null;
  sa: string | null;
  workzone: string | null;
  q: string | null;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  sourceTable: string;
}

function mapTicket(t: any) {
  return {
    idTicket: t.id_ticket,
    ticket: t.incident,
    summary: t.summary,
    reportedDate: toWibString(t.reported_date),
    customerType: t.customer_type,
    ctype: t.customer_type || undefined,
    customerSegment: t.customer_segment,
    serviceNo: t.service_no,
    customerName: t.customer_name,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    sourceTicket: t.source_ticket,
    workzone: t.workzone,
    area: t.area,
    saName: t.sa_name,
    jenisTiket1: t.jenis_tiket_1,
    status: t.status,
    status_update: (() => {
      const v = String(t.status_update ?? '')
        .trim()
        .toLowerCase();
      return v || null;
    })(),
    classificationPath: t.classification_path,
    classificationFlag: t.classification_flag,
    closedAt: toWibString(t.closed_at),
    syncDate: toWibDateString(t.sync_date),
  };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'rekap-workorder-tickets',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const decoded = await protectApi(['superadmin', 'admin', 'helpdesk']);
    const isSuperAdmin = decoded.role === 'superadmin';

    const branchParam = request.nextUrl.searchParams.get('branch');
    const branchSas = await resolveBranchScope(
      decoded.role,
      decoded.id_user,
      branchParam,
    );
    const workzones = isSuperAdmin
      ? null
      : await getWorkzonesForUser(decoded.id_user);

    const requestedWorkzone = String(
      request.nextUrl.searchParams.get('workzone') || '',
    ).trim();
    const selectedWorkzone =
      requestedWorkzone.length > 0 ? requestedWorkzone : undefined;
    if (
      !isSuperAdmin &&
      selectedWorkzone &&
      !(workzones ?? []).includes(selectedWorkzone)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Workzone tidak dalam lingkup akses.',
        },
        { status: 403 },
      );
    }

    const bucket = String(
      request.nextUrl.searchParams.get('bucket') ?? '',
    ).trim();
    const detail = String(request.nextUrl.searchParams.get('detail') ?? '').trim();
    const legacyFlag = String(request.nextUrl.searchParams.get('legacy') ?? '');
    const legacyCustomer = legacyFlag === '1' || legacyFlag === 'true';
    const status = String(request.nextUrl.searchParams.get('status') ?? 'all').trim();
    const area = String(request.nextUrl.searchParams.get('area') ?? '').trim();
    const sa = String(request.nextUrl.searchParams.get('sa') ?? '').trim();
    const cellWz = String(request.nextUrl.searchParams.get('wz') ?? '').trim();
    const q = String(request.nextUrl.searchParams.get('q') ?? '').trim();
    const page = Math.max(
      1,
      Number(request.nextUrl.searchParams.get('page') ?? '1') || 1,
    );
    const limit = Math.min(
      50,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '20') || 20),
    );

    const cacheKey = [
      'dashboard:rekap',
      'v26',
      'members',
      decoded.role,
      decoded.id_user,
      isSuperAdmin ? 'all' : (workzones ?? []).slice().sort().join(','),
      selectedWorkzone ?? 'all',
      branchParam ?? '',
      bucket,
      detail,
      status,
      area,
      sa,
      cellWz,
      legacyCustomer ? '1' : '',
      q,
      page,
      limit,
    ].join(':');

    const data = await getOrSetCache(
      cacheKey,
      async () => {
        const [whereClause, params] =
          await DailyTicketService.buildDailyTicketSqlParams(
            decoded.role,
            decoded.id_user,
            {
              dept: 'all',
              includeClosed: true,
              workzone: selectedWorkzone,
              branchId: branchParam ? Number(branchParam) : undefined,
              operationalBucket: legacyCustomer
                ? ['kpi_customer']
                : undefined,
            },
          );

        const [cellFilterSql, cellParams] = buildCellFilterSql({
          bucket: bucket || undefined,
          detail: detail || undefined,
          status: (['open', 'close', 'all'] as const).includes(
            status as 'open',
          )
            ? (status as 'open' | 'close' | 'all')
            : undefined,
          scope: {
            area: area || undefined,
            sa: sa || undefined,
            workzone: cellWz || undefined,
          },
          legacyCustomer: legacyCustomer || undefined,
          q: q || undefined,
        });

        const fullWhere =
          cellFilterSql === '1=1'
            ? whereClause
            : whereClause === '1=1'
              ? cellFilterSql
              : `(${whereClause}) AND (${cellFilterSql})`;

        const offset = (page - 1) * limit;

        const [rows, countRows] = await Promise.all([
          prisma.$queryRawUnsafe<RekapMemberTicketRow[]>(
            `SELECT /*+ MAX_EXECUTION_TIME(60000) */
              t.id_ticket,
              t.incident,
              t.summary,
              t.reported_date,
              t.status,
              t.status_update,
              t.customer_type,
              t.customer_segment,
              t.customer_name,
              t.service_no,
              t.contact_name,
              t.contact_phone,
              t.source_ticket,
              t.workzone,
              COALESCE(a.nama_area, '') AS area,
              sa.nama_sa AS sa_name,
              t.jenis_tiket_1,
              t.jenis_tiket_2,
              t.classification_path,
              t.classification_flag,
              t.closed_at,
              t.sync_date
            FROM ticket t
            JOIN service_area sa ON sa.nama_sa = t.workzone
            JOIN area a ON a.id_area = sa.area_id
            WHERE ${fullWhere}
            ORDER BY t.id_ticket ASC
            LIMIT ${limit} OFFSET ${offset}`,
            ...params,
            ...cellParams,
          ),
          prisma.$queryRawUnsafe<{ total: bigint }[]>(
            `SELECT COUNT(*) AS total
            FROM ticket t
            JOIN service_area sa ON sa.nama_sa = t.workzone
            JOIN area a ON a.id_area = sa.area_id
            WHERE ${fullWhere}`,
            ...params,
            ...cellParams,
          ),
        ]);

        const total = Number(countRows[0]?.total ?? 0);
        const meta: RekapMembersMeta = {
          bucket,
          detail: detail || null,
          status,
          legacyCustomer,
          area: area || null,
          sa: sa || null,
          workzone: cellWz || null,
          q: q || null,
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
          sourceTable: 'ticket',
        };

        return {
          meta,
          tickets: rows.map(mapTicket),
        };
      },
      30,
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logger.error('Rekap workorder tickets error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 },
    );
  }
}