// Query DB (cache-key builder + fetch) untuk Rekap Workorder — dipisah dari
// route.ts semata untuk memecah unit kompilasi jadi lebih kecil. Tidak ada
// perubahan logic, murni pemindahan kode.

import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { getOrSetCacheSwr } from '@/lib/cache';
import { getTodayWibRange } from '@/lib/timezone';
import { toZonedTime } from 'date-fns-tz';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';
import {
  buildKpiBucketFilterSql,
  type KpiBucketKey,
} from '@/app/libs/services/kpi-bucket-sql';
import { logger } from '@/lib/observability/logger';
import { buildRekapBucketFilterSql } from '@/lib/rekap/rekap-cell-filter';
import { isSqmUpdateReasonSql } from '@/lib/sqm-update';
import type {
  RekapTicketRow,
  CustomerSqmOverlayRow,
  LegacyCustomerBucketRow,
  AgingRow,
  BucketSummaryCounts,
} from './types';
import { buildTicketManagementBucketSummary } from './aggregate';

// Bump this whenever bucket classification or detail aggregation changes.
export const REKAP_WORKORDER_CACHE_VERSION = 'v28';
export const REKAP_TEKNISI_CACHE_VERSION = 'v2';

export function buildRekapTicketsCacheKey(
  role: string,
  userId: number,
  syncDate: string,
  bucket: KpiBucketKey,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): string {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  return `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:raw:${syncDate}:${role}:${userId}:${bucket}:${normalizedDept}:${workzone || 'all'}:${branchId ?? ''}`;
}

export function buildRekapTeknisiCacheKey(
  syncDate: string,
  userId: number,
  scope: string,
): string {
  return `dashboard:rekap:${REKAP_TEKNISI_CACHE_VERSION}:teknisi:${syncDate}:${userId}:${scope}`;
}

export function buildRekapTeknisiRegisteredCacheKey(
  userId: number,
  scope: string,
): string {
  return `dashboard:rekap:${REKAP_TEKNISI_CACHE_VERSION}:teknisi-registered:${userId}:${scope}`;
}

export function buildRekapAgingCacheKey(
  role: string,
  userId: number,
  bucket: string,
  workzone: string | undefined,
  branchId?: number | string,
): string {
  return `dashboard:rekap:${REKAP_WORKORDER_CACHE_VERSION}:aging:${role}:${userId}:${bucket}:${workzone || 'all'}:${branchId ?? ''}`;
}

export async function getFilteredRekapTickets(
  role: string,
  userId: number,
  syncDate: string,
  bucket: KpiBucketKey,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): Promise<RekapTicketRow[]> {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    bucket,
    workzone,
    branchId,
    normalizedDept,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const { start: todayStart } = getTodayWibRange();
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: normalizedDept,
          includeClosed: true,
          workzone,
          branchId,
        });
      const bucketWhere = buildRekapBucketFilterSql(bucket);
      const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      a.nama_area                     AS area,
      sa.nama_sa                      AS sa_name,
      t.workzone,
      t.customer_type,
      t.customer_segment,
      COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      t.closed_at,
      t.source_ticket,
      t.classification_flag,
      t.classification_path,
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
      AND (${bucketWhere})
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;
      return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
    },
    60,
  );
}

export async function getCustomerSqmOverlayTickets(
  role: string,
  userId: number,
  syncDate: string,
  workzone?: string,
  branchId?: number | string,
): Promise<{ proactive: RekapTicketRow[]; sqmUpdate: RekapTicketRow[] }> {
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    'customer_sqm' as KpiBucketKey,
    workzone,
    branchId,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: 'all',
          includeClosed: true,
          workzone,
          branchId,
        });
      const proactiveWhere = buildKpiBucketFilterSql('kpi_proactive');
      const sqmWhere = `LOWER(source_ticket) = 'proactive'
         AND (classification_path IS NULL OR classification_path != 'Z_PERMINTAAN_044')
         AND ${isSqmUpdateReasonSql('')}
         AND (LOWER(jenis_tiket_1) LIKE '%sqm%' OR LOWER(jenis_tiket_1) LIKE '%sqm-ccan%')`;

      const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      CASE
        WHEN (${proactiveWhere}) THEN 'proactive'
        WHEN (${sqmWhere}) THEN 'sqm_update'
      END AS overlay_kind,
      a.nama_area                     AS area,
      sa.nama_sa                      AS sa_name,
      t.workzone,
      t.customer_type,
      t.customer_segment,
      COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      t.closed_at,
      t.source_ticket,
      t.classification_flag,
      t.classification_path,
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
      AND ((${proactiveWhere}) OR (${sqmWhere}))
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path, overlay_kind,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;
      const rows = await prisma.$queryRawUnsafe<CustomerSqmOverlayRow[]>(
        fullSql,
        ...params,
      );
      const proactive: RekapTicketRow[] = [];
      const sqmUpdate: RekapTicketRow[] = [];

      for (const row of rows) {
        const { overlay_kind: overlayKind, ...ticketRow } = row;
        if (overlayKind === 'proactive') {
          proactive.push(ticketRow);
        } else if (overlayKind === 'sqm_update') {
          sqmUpdate.push(ticketRow);
        }
      }

      return { proactive, sqmUpdate };
    },
    60,
  );
}

export async function getCustomerGamasOverlayTickets(
  role: string,
  userId: number,
  syncDate: string,
  workzone?: string,
  branchId?: number | string,
): Promise<RekapTicketRow[]> {
  const cacheKey = buildRekapTicketsCacheKey(
    role,
    userId,
    syncDate,
    'customer_gamas' as KpiBucketKey,
    workzone,
    branchId,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const [whereClause, params] =
        await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
          dept: 'all',
          includeClosed: true,
          workzone,
          branchId,
        });
      const gamasWhere = `LOWER(t.source_ticket) = 'gamas'`;

      const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      a.nama_area                     AS area,
      sa.nama_sa                      AS sa_name,
      t.workzone,
      t.customer_type,
      t.customer_segment,
      COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      t.closed_at,
      t.source_ticket,
      t.classification_flag,
      t.classification_path,
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
      AND ${gamasWhere}
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;
      return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
    },
    60,
  );
}

export async function getLegacyCustomerBucketRows(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): Promise<LegacyCustomerBucketRow[]> {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  const [whereClause, params] =
    await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept: normalizedDept,
      operationalBucket: ['kpi_customer'],
      includeClosed: true,
      workzone,
      branchId,
    });

  const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      a.nama_area AS area,
      sa.nama_sa AS sa_name,
      t.workzone,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a ON a.id_area = sa.area_id
    WHERE ${whereClause}
    GROUP BY area, sa_name, workzone, status, status_update
    ORDER BY area, sa_name, workzone
  `;

  return prisma.$queryRawUnsafe<LegacyCustomerBucketRow[]>(fullSql, ...params);
}

export async function getLegacyCustomerRekapTickets(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
  dept: 'all' | 'b2c' | 'b2b' | 'netral' | 'neutral' = 'all',
): Promise<RekapTicketRow[]> {
  const normalizedDept = dept === 'neutral' ? 'netral' : dept;
  const [whereClause, params] =
    await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
      dept: normalizedDept,
      operationalBucket: ['kpi_customer'],
      includeClosed: true,
      workzone,
      branchId,
    });

  const fullSql = `
    SELECT /*+ MAX_EXECUTION_TIME(120000) */
      a.nama_area                     AS area,
      sa.nama_sa                      AS sa_name,
      t.workzone,
      t.customer_type,
      t.customer_segment,
      COALESCE(t.jenis_tiket_2, t.jenis_tiket_1) AS jenis_tiket,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      t.closed_at,
      t.source_ticket,
      t.classification_flag,
      t.classification_path,
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      COUNT(*) AS cnt
    FROM ticket t
    JOIN service_area sa ON sa.nama_sa = t.workzone
    JOIN area a          ON a.id_area = sa.area_id
    WHERE ${whereClause}
    GROUP BY area, sa_name, workzone, customer_type, customer_segment,
             jenis_tiket, status, status_update, closed_at,
             source_ticket, classification_flag, classification_path,
             is_sqm_update, jenis_tiket_1, jenis_tiket_2
    ORDER BY area, sa_name, workzone
  `;

  return prisma.$queryRawUnsafe<RekapTicketRow[]>(fullSql, ...params);
}

export async function getCustomerRekapTicketsSafe(
  role: string,
  userId: number,
  today: string,
  workzone?: string,
  branchId?: number | string,
): Promise<RekapTicketRow[]> {
  try {
    const [b2cRows, b2bRows] = await Promise.all([
      getLegacyCustomerRekapTickets(role, userId, workzone, branchId, 'b2c'),
      getLegacyCustomerRekapTickets(role, userId, workzone, branchId, 'b2b'),
    ]);
    return [...b2cRows, ...b2bRows];
  } catch (error) {
    logger.warn(
      'Legacy customer rekap failed, falling back to standard customer rekap',
      {
        role,
        userId,
        today,
        error: String((error as Error)?.message ?? error),
      },
    );
    const [b2cRows, b2bRows] = await Promise.all([
      getFilteredRekapTickets(
        role,
        userId,
        today,
        'kpi_customer',
        workzone,
        branchId,
        'b2c',
      ),
      getFilteredRekapTickets(
        role,
        userId,
        today,
        'kpi_customer',
        workzone,
        branchId,
        'b2b',
      ),
    ]);
    return [...b2cRows, ...b2bRows];
  }
}

export async function getRekapTeknisiRows(
  syncDate: string,
  userId: number,
  workzones: string[] | null,
): Promise<{ sa_name: string; cnt: bigint }[]> {
  const scope =
    workzones && workzones.length > 0
      ? workzones.slice().sort().join(',')
      : 'all';
  const cacheKey = buildRekapTeknisiCacheKey(syncDate, userId, scope);
  return getOrSetCacheSwr(
    cacheKey,
    async () => prisma.$queryRaw<{ sa_name: string; cnt: bigint }[]>`
      SELECT sa.nama_sa AS sa_name, COUNT(DISTINCT a.technician_id) AS cnt
      FROM technician_attendance a
      JOIN service_area sa ON sa.id_sa = a.workzone_id
      JOIN users u ON u.id_user = a.technician_id
      WHERE a.date = ${syncDate}
        AND u.role_id = 4
      ${workzones && workzones.length > 0 ? Prisma.sql`AND sa.nama_sa IN (${Prisma.join(workzones)})` : Prisma.sql``}
      GROUP BY sa.nama_sa
    `,
    120,
  );
}

export async function getRekapTeknisiRegistered(
  userId: number,
  workzones: string[] | null,
): Promise<{ sa_name: string; cnt: bigint }[]> {
  const scope =
    workzones && workzones.length > 0
      ? workzones.slice().sort().join(',')
      : 'all';
  const cacheKey = buildRekapTeknisiRegisteredCacheKey(userId, scope);
  return getOrSetCacheSwr(
    cacheKey,
    async () => prisma.$queryRaw<{ sa_name: string; cnt: bigint }[]>`
      SELECT sa.nama_sa AS sa_name, COUNT(DISTINCT u.id_user) AS cnt
      FROM user_sa usa
      JOIN service_area sa ON sa.id_sa = usa.sa_id
      JOIN users u ON u.id_user = usa.user_id
      WHERE u.role_id = 4
      ${workzones && workzones.length > 0 ? Prisma.sql`AND sa.nama_sa IN (${Prisma.join(workzones)})` : Prisma.sql``}
      GROUP BY sa.nama_sa
    `,
    300,
  );
}

export async function getRekapAging(
  role: string,
  userId: number,
  bucket: string,
  workzone?: string,
  branchId?: number | string,
): Promise<AgingRow[]> {
  const cacheKey = buildRekapAgingCacheKey(
    role,
    userId,
    bucket,
    workzone,
    branchId,
  );
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      try {
        const [whereClause, params] =
          await DailyTicketService.buildDailyTicketSqlParams(role, userId, {
            dept: 'all',
            includeClosed: true,
            workzone,
            branchId,
          });
        const bucketWhere = buildRekapBucketFilterSql(bucket);
        const closeStatusSql = CLOSE_STATUS_VALUES.map(
          (status) => `'${status.replace(/'/g, "''")}'`,
        ).join(', ');
        const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
        const nowTs = wibNow.getTime();
        const threshold = (hours: number) => new Date(nowTs - hours * 3_600_000);

        const sql = `
          SELECT
            sa.nama_sa                         AS saName,
            COUNT(*)                           AS openCount,
            MIN(t.booking_date)                AS oldestAt,
            SUM(CASE WHEN t.booking_date < ? THEN 1 ELSE 0 END) AS g24,
            SUM(CASE WHEN t.booking_date < ? THEN 1 ELSE 0 END) AS g48,
            SUM(CASE WHEN t.booking_date < ? THEN 1 ELSE 0 END) AS g72
          FROM ticket t
          JOIN service_area sa ON sa.nama_sa = t.workzone
          WHERE ${whereClause}
            AND (${bucketWhere})
            AND t.status NOT IN (${closeStatusSql})
          GROUP BY sa.nama_sa
        `;
        const rows = await prisma.$queryRawUnsafe<
          Array<{
            saName: string;
            openCount: bigint;
            oldestAt: Date | null;
            g24: bigint;
            g48: bigint;
            g72: bigint;
          }>
        >(withMaxExecutionTime(sql), ...params, threshold(24), threshold(48), threshold(72));
        return rows.map((r) => ({
          saName: r.saName,
          openCount: Number(r.openCount ?? 0),
          oldestAt: r.oldestAt,
          g24: Number(r.g24 ?? 0),
          g48: Number(r.g48 ?? 0),
          g72: Number(r.g72 ?? 0),
        }));
      } catch (error) {
        logger.warn('Rekap aging query failed', {
          role,
          userId,
          bucket,
          workzone,
          branchId,
          error: String((error as Error)?.message ?? error),
        });
        return [];
      }
    },
    300,
  );
}

export async function getRekapExpectedServiceAreas(
  branchId?: number | string,
  workzone?: string,
): Promise<{ area: string; saName: string }[]> {
  if (workzone) {
    return getOrSetCacheSwr(
      `rekap:sa-area:${workzone}`,
      async () =>
        prisma.$queryRaw<{ area: string; saName: string }[]>`
          SELECT a.nama_area AS area, sa.nama_sa AS saName
          FROM service_area sa
          JOIN area a ON a.id_area = sa.area_id
          WHERE sa.nama_sa = ${workzone}
          ORDER BY a.nama_area, sa.nama_sa
        `,
      3600,
    );
  }

  if (branchId) {
    const id = Number(branchId);
    if (!Number.isFinite(id) || id <= 0) return [];
    return getOrSetCacheSwr(
      `rekap:branch-sa-areas:${id}`,
      async () =>
        prisma.$queryRaw<{ area: string; saName: string }[]>`
          SELECT a.nama_area AS area, sa.nama_sa AS saName
          FROM service_area sa
          JOIN area a ON a.id_area = sa.area_id
          WHERE a.branch_id = ${id}
          ORDER BY a.nama_area, sa.nama_sa
        `,
      3600,
    );
  }

  return getOrSetCacheSwr(
    'rekap:all-sa-areas',
    async () =>
      prisma.$queryRaw<{ area: string; saName: string }[]>`
        SELECT a.nama_area AS area, sa.nama_sa AS saName
        FROM service_area sa
        JOIN area a ON a.id_area = sa.area_id
        ORDER BY a.nama_area, sa.nama_sa
      `,
    3600,
  );
}

export async function getDailyOpenSummary(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
): Promise<BucketSummaryCounts> {
  const result = await DailyTicketService.getDailyTicketTable(role, userId, {
    dept: 'all',
    operationalBucket: [bucket],
    includeClosed: true,
    includeValidasi: false,
    includeValidasiTickets: false,
    includeOptions: false,
    includeSummary: true,
    page: 1,
    limit: 1,
  });

  return {
    total: result.summary.total,
    open: result.summary.open,
    assigned: result.summary.assigned,
    onProgress: 0,
    pending: 0,
    close: result.summary.close,
  };
}

export async function getTicketManagementBucketSummary(
  role: string,
  userId: number,
  bucket: KpiBucketKey,
  workzone?: string,
  branchId?: number | string,
): Promise<BucketSummaryCounts> {
  const [openResult, closeResult] = await Promise.all([
    DailyTicketService.getDailyTicketTable(role, userId, {
      dept: 'all',
      operationalBucket: [bucket],
      workzone,
      branchId,
      includeValidasi: false,
      includeValidasiTickets: false,
      includeOptions: false,
      page: 1,
      limit: 1,
    }),
    DailyTicketService.getDailyTicketTable(role, userId, {
      dept: 'all',
      operationalBucket: [bucket],
      ticketStatus: CLOSE_STATUS_VALUES,
      includeClosed: true,
      workzone,
      branchId,
      includeValidasi: false,
      includeValidasiTickets: false,
      includeOptions: false,
      page: 1,
      limit: 1,
    }),
  ]);

  return buildTicketManagementBucketSummary(
    openResult.summary,
    closeResult.summary,
  );
}

export async function getDailyBucketSummaryMatrix(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
): Promise<
  Awaited<ReturnType<typeof DailyTicketService.getKpiBucketSummaryMatrix>>
> {
  return DailyTicketService.getKpiBucketSummaryMatrix(role, userId, {
    dept: 'all',
    includeClosed: true,
    workzone,
    branchId,
  });
}
