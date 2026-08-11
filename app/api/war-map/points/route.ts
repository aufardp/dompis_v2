export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getOrSetCache } from '@/lib/cache';
import { getJenisWhereClause } from '@/app/config/jenis-tiket';
import { buildOperationalBucketWhere } from '@/app/libs/services/ticket-buckets';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { todayWibDateForDb } from '@/lib/timezone';
import type { OperationalBucketKey } from '@/app/config/operational-buckets';

const CACHE_TTL = 15;
const MAX_POINTS = 5000;
const HOT_LOOKBACK_DAYS = 60;
const CUSTOMER_BUCKET_SERVICE_NO_LIMIT = 20000;
const ACTIVE_STATUSES = ['open', 'assigned', 'on_progress', 'pending'];
const ALL_STATUSES = [...ACTIVE_STATUSES, 'close', 'closed'];

function parseBoolean(value: string | null): boolean {
  return value === 'true' || value === '1';
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function splitList(value: string | null): string[] {
  if (!value || !value.trim()) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export async function GET(req: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-points',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'senior_leader',
      'admin_branch',
    ]);

    const { searchParams } = req.nextUrl;

    // bbox: south,west,north,east
    const bbox = bboxParts(
      (searchParams.get('bbox') || '')
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v)),
    );

    const workzones = splitList(searchParams.get('workzone'));
    const areas = splitList(searchParams.get('area'));
    const statusFilter = splitList(searchParams.get('status')).filter((v) =>
      ALL_STATUSES.includes(v),
    );
    const activeOnly = parseBoolean(searchParams.get('activeOnly'));
    const hotOnly = parseBoolean(searchParams.get('hotOnly'));
    const jenis = (searchParams.get('jenis') || '').trim();

    const from = toDate(searchParams.get('from'));
    const to = toDate(searchParams.get('to'));

    const bucket = resolveBucketKey(searchParams.get('bucket'));

    // Scoping wilayah
    const isSuperAdmin = user.role === 'superadmin' || user.role === 'super_admin';
    const userWorkzones = isSuperAdmin
      ? null
      : (await getWorkzonesForUser(user.id_user)).filter(
          (w) => w && w.trim() !== '',
        );

    // Strict: non-superadmin tanpa mapping workzone tidak berhak melihat titik.
    if (!isSuperAdmin && (userWorkzones ?? []).length === 0) {
      return NextResponse.json({
        success: true,
        data: { points: [], meta: { total: 0, limit: MAX_POINTS } },
      });
    }

    const saNames = areas.length > 0 ? await resolveAreaSamNames(areas) : [];

    const where: Prisma.service_locationWhereInput = {};

    if (bbox) {
      const { south, west, north, east } = bbox;
      if (south > north) {
        where.latitude = { gte: north, lte: south };
      } else {
        where.latitude = { gte: south, lte: north };
      }
      if (west > east) {
        where.longitude = { gte: west, lte: east };
      } else {
        where.longitude = { gte: west, lte: east };
      }
    }

    if (isSuperAdmin) {
      const effectiveWorkzones = [...new Set([...workzones, ...saNames])];
      if (effectiveWorkzones.length > 0) {
        where.workzone = { in: effectiveWorkzones };
      }
    } else {
      // Non-superadmin: dibatasi ketat ke workzone miliknya.
      // Param workzone/area yang diminta di-intersect ke set miliknya (anti-spoof).
      const own = userWorkzones ?? [];
      const allowed = new Set(own);
      const requested = [...new Set([...workzones, ...saNames])];
      const effectiveWorkzones = [
        ...own,
        ...requested.filter((w) => allowed.has(w)),
      ];
      where.workzone = { in: [...new Set(effectiveWorkzones)] };
    }

    if (from || to) {
      where.updated_at = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const lastTicketWhere: Prisma.ticketWhereInput = {};
    if (statusFilter.length > 0) {
      lastTicketWhere.status_update = { in: statusFilter };
    } else if (activeOnly) {
      lastTicketWhere.status_update = { in: ACTIVE_STATUSES };
    }
    if (jenis) {
      const jenisWhere = getJenisWhereClause(jenis);
      lastTicketWhere.jenis_tiket_2 = { in: jenisWhere.jenis_tiket_2.in };
    }
    if (bucket === 'kpi_proactive' || bucket === 'non_kpi_unspec') {
      lastTicketWhere.AND = buildOperationalBucketWhere(bucket);
    } else if (bucket === 'kpi_customer') {
      // Bucket Customer bersifat harian (sama seperti dashboard):
      // titik map = service_no yang ada di bucket customer HARI INI.
      // Definisi bucket TIDAK diubah — hanya direpresentasikan lewat service_no.
      const customerServiceNos = await fetchCustomerBucketServiceNos();
      if (customerServiceNos.length === 0) {
        return NextResponse.json({
          success: true,
          data: { points: [], meta: { total: 0, limit: MAX_POINTS } },
        });
      }
      where.service_no = { in: customerServiceNos };
    }
    if (Object.keys(lastTicketWhere).length > 0) {
      where.last_ticket = lastTicketWhere;
    }

    const cacheKey = [
      'war-map:points',
      user.id_user,
      searchParams.get('bbox') || 'all',
      workzones.join(','),
      areas.join(','),
      searchParams.get('status') || 'all',
      activeOnly ? 'active' : 'all',
      hotOnly ? 'hot' : 'all',
      jenis || 'all',
      bucket || 'all',
      bucket === 'kpi_customer' ? todayWibDateForDb().toISOString().slice(0, 10) : '',
      searchParams.get('from') || '',
      searchParams.get('to') || '',
    ].join('|');

    const data = await getOrSetCache(cacheKey, async () => {
      const rows = await prisma.service_location.findMany({
        where,
        take: MAX_POINTS,
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          service_no: true,
          customer_name: true,
          alamat: true,
          latitude: true,
          longitude: true,
          accuracy_meters: true,
          device_name: true,
          barcode_dc: true,
          workzone: true,
          tagged_count: true,
          updated_at: true,
          last_ticket: {
            select: {
              id_ticket: true,
              incident: true,
              status_update: true,
              closed_at: true,
            },
          },
          _count: {
            select: {
              history: {
                where: {
                  tagged_at: {
                    gte: new Date(
                      Date.now() - HOT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
                    ),
                  },
                },
              },
            },
          },
        },
      });

      const points = rows
        .map((r) => ({
          id: r.id,
          serviceNo: r.service_no,
          customerName: r.customer_name,
          alamat: r.alamat,
          latitude: r.latitude.toNumber(),
          longitude: r.longitude.toNumber(),
          accuracyMeters: r.accuracy_meters ? r.accuracy_meters.toNumber() : null,
          deviceName: r.device_name,
          barcodeDc: r.barcode_dc,
          workzone: r.workzone,
          taggedCount: r.tagged_count,
          historyCount60d: r._count.history,
          isHot: r._count.history >= 3,
          updatedAt: r.updated_at,
          lastTicket: r.last_ticket
            ? {
                id: r.last_ticket.id_ticket,
                incident: r.last_ticket.incident,
                statusUpdate: r.last_ticket.status_update,
                closedAt: r.last_ticket.closed_at,
              }
            : null,
        }))
        .filter((p) => !hotOnly || p.isHot);

      return { points, meta: { total: points.length, limit: MAX_POINTS } };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}

function bboxParts(
  parts: number[],
): { south: number; west: number; north: number; east: number } | null {
  if (parts.length < 4) return null;
  const [south, west, north, east] = parts;
  if (![south, west, north, east].every((v) => Number.isFinite(v))) return null;
  return { south, west, north, east };
}

const BUCKET_ALIASES: Record<string, OperationalBucketKey> = {
  customer: 'kpi_customer',
  proactive: 'kpi_proactive',
  unspec: 'non_kpi_unspec',
};

/**
 * Ambil daftar service_no milik bucket Customer HARI INI.
 *
 * Predikatnya diambil DARI dashboard itu sendiri:
 * - applyDailyTicketFilter(..., legacy=true) → predikat harian customer
 *   (sync_date=today untuk open/closed hari ini + carry-over pending_dompis)
 * - buildOperationalBucketWhere('kpi_customer') → definisi bucket customer
 *
 * Definisi bucket TIDAK diubah di sini; hanya direpresentasikan lewat service_no.
 */
async function fetchCustomerBucketServiceNos(): Promise<string[]> {
  const dailyWhere: Record<string, any> = {};
  await DailyTicketService.applyDailyTicketFilter(dailyWhere, undefined, true);

  const rows = await prisma.ticket.findMany({
    where: {
      AND: [
        ...(dailyWhere.AND ?? []),
        buildOperationalBucketWhere('kpi_customer'),
        { service_no: { not: null } },
      ],
    },
    select: { service_no: true },
    distinct: ['service_no'],
    take: CUSTOMER_BUCKET_SERVICE_NO_LIMIT,
  });

  return rows
    .map((r) => r.service_no)
    .filter((v): v is string => Boolean(v && v.trim() !== ''));
}

function resolveBucketKey(value: string | null): OperationalBucketKey | null {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  return BUCKET_ALIASES[key] ?? null;
}

async function resolveAreaSamNames(areas: string[]): Promise<string[]> {
  const areaRows = await prisma.area.findMany({
    where: { nama_area: { in: areas } },
    select: { service_area: { select: { nama_sa: true } } },
  });
  const names = new Set<string>();
  areaRows.forEach((a) =>
    a.service_area.forEach((sa) => {
      if (sa.nama_sa) names.add(sa.nama_sa);
    }),
  );
  return [...names];
}