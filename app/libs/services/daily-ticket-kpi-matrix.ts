// Grup "kpi-bucket-matrix" untuk domain Daily Ticket — dipisah dari
// daily-ticket.service.ts (yang tadinya 3521 baris) semata untuk memecah unit
// kompilasi jadi lebih kecil. Method `static` di class asli jadi fungsi biasa
// di sini (pemanggilan `this.xxx()` jadi `xxx()` langsung); tidak ada
// perubahan logic.

import type { Prisma } from '@prisma/client';
import { DASHBOARD_SUMMARY_CACHE_TTL, getOrSetCacheSwr } from '@/lib/cache';
import { buildKpiBucketFilterSql, type KpiBucketKey } from '@/app/libs/services/kpi-bucket-sql';
import { buildOperationalBucketWhere } from './ticket-buckets';
import {
  type TicketFilters,
  type BucketSummary,
  type BucketSummaryMap,
  type BucketSummaryMatrix,
  type TicketManagementBucketSummary,
  type TicketManagementOverviewSummary,
  buildSqlWhereClause,
  buildStatusCategorySql,
  buildBucketSummaryProjectionSql,
  normalizeBucketSummaryRow,
  parseCountValue,
  buildKpiBucketSummaryCacheKey,
  queryRawWithOptionalIndex,
} from './daily-ticket-helpers';
import { buildDailyTicketWhere, buildMainTableWhere } from './daily-ticket-where';

export async function getKpiBucketSummaryMatrix(
  role: string,
  userId: number,
  filters?: TicketFilters,
  workzone?: string,
  branchId?: number | string,
): Promise<BucketSummaryMatrix> {
  const cacheKey = buildKpiBucketSummaryCacheKey(role, userId, filters);
  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      type BucketKeyNoAll = Exclude<KpiBucketKey, 'all'>;
      const NON_KPI_BUCKETS: BucketKeyNoAll[] = ['kpi_proactive', 'non_kpi_unspec', 'non_technical', 'sqm_update', 'obsolete'];

      // 3-segmen: netral priority, permintaan dinamis, lalu b2c/b2b via jenis
      const SEG_SQL = `CASE WHEN LOWER(TRIM(REPLACE(REPLACE(COALESCE(jenis_tiket_2,''),' ','-'),'_','-'))) IN ('unknown','digital-spbu','non-numbering','billing','infracare') THEN 'netral' WHEN LOWER(TRIM(COALESCE(jenis_tiket_2,'')))='permintaan' THEN CASE WHEN customer_segment IN ('DCS','PL-TSEL') THEN 'b2c' ELSE 'b2b' END WHEN LOWER(TRIM(REPLACE(REPLACE(COALESCE(jenis_tiket_2,''),' ','-'),'_','-'))) IN ('reguler','hvc','sqm','unspec') THEN 'b2c' ELSE 'b2b' END AS seg`;

      const buildSegmentAggregateColumns = (bucket: BucketKeyNoAll): string[] => {
        return [
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__total\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'open' THEN 1 ELSE 0 END) AS \`${bucket}__open\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'assigned' THEN 1 ELSE 0 END) AS \`${bucket}__assigned\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'on_progress' THEN 1 ELSE 0 END) AS \`${bucket}__on_progress\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'pending' THEN 1 ELSE 0 END) AS \`${bucket}__pending\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'close' THEN 1 ELSE 0 END) AS \`${bucket}__close\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_ffg\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__ffg\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_gamas\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__gamas\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_p1\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__p1\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_p_plus\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__p_plus\``,
        ];
      };

      const mergeSegmentRows = (
        a?: Record<string, unknown>,
        b?: Record<string, unknown>,
      ): Record<string, unknown> => {
        const keys = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          out[key] = Number(a?.[key] ?? 0) + Number(b?.[key] ?? 0);
        }
        return out;
      };

      // ── Scan 1: 5 non-KPI buckets (single pass, group by seg) ────────────
      const baseWhere = await buildDailyTicketWhere(role, userId, {
        ...filters,
        dept: undefined,
        operationalBucket: undefined,
        workzone: workzone ?? filters?.workzone,
        branchId: branchId ?? filters?.branchId,
      });
      const mainTableWhere = buildMainTableWhere(baseWhere, {
        includeClosed: filters?.includeClosed === true,
      });
      const [mainSql, mainParams] = buildSqlWhereClause(mainTableWhere);

      const nonKpiProjectionCols = [
        `${buildStatusCategorySql()} AS status_category`,
        SEG_SQL,
        ...NON_KPI_BUCKETS.flatMap((bucket) =>
          buildBucketSummaryProjectionSql(bucket).split(',\n'),
        ),
      ];
      const nonKpiSql = `
        SELECT /*+ MAX_EXECUTION_TIME(120000) */
          seg,
          ${NON_KPI_BUCKETS.flatMap((bucket) => buildSegmentAggregateColumns(bucket)).join(',\n    ')}
        FROM (
          SELECT
            ${nonKpiProjectionCols.join(',\n              ')}
          FROM ticket
          WHERE ${mainSql}
        ) scoped
        GROUP BY seg
      `;
      const nonKpiRows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
        nonKpiSql, nonKpiSql, mainParams,
      );
      const nonKpiBySeg = new Map<string, Record<string, unknown>>();
      for (const row of nonKpiRows ?? []) nonKpiBySeg.set(String(row.seg), row);

      const allSummary = {} as BucketSummaryMap;
      const b2cSummary = {} as BucketSummaryMap;
      const b2bSummary = {} as BucketSummaryMap;
      for (const bucket of NON_KPI_BUCKETS) {
        b2cSummary[bucket] = normalizeBucketSummaryRow(nonKpiBySeg.get('b2c'), bucket);
        b2bSummary[bucket] = normalizeBucketSummaryRow(nonKpiBySeg.get('b2b'), bucket);
        allSummary[bucket] = normalizeBucketSummaryRow(
          mergeSegmentRows(nonKpiBySeg.get('b2c'), nonKpiBySeg.get('b2b')),
          bucket,
        );
      }

      // ── Scan 2: kpi_customer (mempertahankan daily filter legacy + operational bucket) ──
      const kpiWhere = await buildDailyTicketWhere(role, userId, {
        ...filters,
        dept: undefined,
        operationalBucket: ['kpi_customer'],
        workzone: workzone ?? filters?.workzone,
        branchId: branchId ?? filters?.branchId,
      });
      const kpiMainTableWhere = buildMainTableWhere(kpiWhere, {
        includeClosed: filters?.includeClosed === true,
      });
      const kpiFinalWhere: Prisma.ticketWhereInput = {
        AND: [kpiMainTableWhere, buildOperationalBucketWhere('kpi_customer')],
      };
      const [kpiSql, kpiParams] = buildSqlWhereClause(kpiFinalWhere);
      const kpiProjectionCols = [
        `${buildStatusCategorySql()} AS status_category`,
        SEG_SQL,
        ...buildBucketSummaryProjectionSql('kpi_customer').split(',\n'),
      ];
      const kpiQuery = `
        SELECT /*+ MAX_EXECUTION_TIME(120000) */
          seg,
          ${buildSegmentAggregateColumns('kpi_customer').join(',\n    ')}
        FROM (
          SELECT
            ${kpiProjectionCols.join(',\n              ')}
          FROM ticket
          WHERE ${kpiSql}
        ) scoped
        GROUP BY seg
      `;
      const kpiRows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
        kpiQuery, kpiQuery, kpiParams,
      );
      const kpiBySeg = new Map<string, Record<string, unknown>>();
      for (const row of kpiRows ?? []) kpiBySeg.set(String(row.seg), row);

      b2cSummary.kpi_customer = normalizeBucketSummaryRow(kpiBySeg.get('b2c'), 'kpi_customer');
      b2bSummary.kpi_customer = normalizeBucketSummaryRow(kpiBySeg.get('b2b'), 'kpi_customer');
      allSummary.kpi_customer = normalizeBucketSummaryRow(
        mergeSegmentRows(kpiBySeg.get('b2c'), kpiBySeg.get('b2b')),
        'kpi_customer',
      );

      return { all: allSummary, b2c: b2cSummary, b2b: b2bSummary };
    },
    DASHBOARD_SUMMARY_CACHE_TTL,
  );
}

export async function getTicketManagementOverviewSummary(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
): Promise<TicketManagementOverviewSummary> {
  const scopedUserId = role === 'superadmin' || role === 'super_admin' ? 0 : userId;
  const branchKey = branchId ? `:${branchId}` : '';
  const cacheKey = `dashboard:ticket_management_overview_summary:${role}:${scopedUserId}:${workzone || 'all'}${branchKey}`;

  return getOrSetCacheSwr(
    cacheKey,
    async () => {
      const bucketDefs = [
        { key: 'kpiCustomer', bucket: 'kpi_customer' as const },
        { key: 'kpiProactive', bucket: 'kpi_proactive' as const },
        { key: 'nonKpiUnspec', bucket: 'non_kpi_unspec' as const },
        { key: 'nonTechnical', bucket: 'non_technical' as const },
        { key: 'sqmUpdate', bucket: 'sqm_update' as const },
        { key: 'obsolete', bucket: 'obsolete' as const },
      ];

      const NON_KPI_BUCKETS = ['kpi_proactive', 'non_kpi_unspec', 'non_technical', 'sqm_update', 'obsolete'] as const;
      type BucketKeyNoKpi = (typeof NON_KPI_BUCKETS)[number];
      const ALL_BUCKETS = ['kpi_customer', ...NON_KPI_BUCKETS] as const;

      const SEG_SQL = `CASE WHEN LOWER(TRIM(REPLACE(REPLACE(COALESCE(jenis_tiket_2,''),' ','-'),'_','-'))) IN ('unknown','digital-spbu','non-numbering','billing','infracare') THEN 'netral' WHEN LOWER(TRIM(COALESCE(jenis_tiket_2,'')))='permintaan' THEN CASE WHEN customer_segment IN ('DCS','PL-TSEL') THEN 'b2c' ELSE 'b2b' END WHEN LOWER(TRIM(REPLACE(REPLACE(COALESCE(jenis_tiket_2,''),' ','-'),'_','-'))) IN ('reguler','hvc','sqm','unspec') THEN 'b2c' ELSE 'b2b' END AS seg`;

      const buildSegmentAggregateColumns = (bucket: string): string[] => {
        return [
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__total\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'open' THEN 1 ELSE 0 END) AS \`${bucket}__open\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'assigned' THEN 1 ELSE 0 END) AS \`${bucket}__assigned\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'on_progress' THEN 1 ELSE 0 END) AS \`${bucket}__on_progress\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'pending' THEN 1 ELSE 0 END) AS \`${bucket}__pending\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND status_category = 'close' THEN 1 ELSE 0 END) AS \`${bucket}__close\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_ffg\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__ffg\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_gamas\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__gamas\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_p1\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__p1\``,
          `SUM(CASE WHEN \`${bucket}__hit\` = 1 AND \`${bucket}__is_p_plus\` = 1 THEN 1 ELSE 0 END) AS \`${bucket}__p_plus\``,
        ];
      };

      const mergeSegmentRows = (
        a?: Record<string, unknown>,
        b?: Record<string, unknown>,
      ): Record<string, unknown> => {
        const keys = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          out[key] = Number(a?.[key] ?? 0) + Number(b?.[key] ?? 0);
        }
        return out;
      };

      // ── Scan 1: open-scope, 5 non-KPI buckets (single pass, group by seg) ──
      const baseWhere = await buildDailyTicketWhere(role, userId, {
        workzone,
        branchId,
        dept: undefined,
        operationalBucket: undefined,
      });
      const mainTableWhere = buildMainTableWhere(baseWhere, { includeClosed: false });
      const [mainSql, mainParams] = buildSqlWhereClause(mainTableWhere);

      const nonKpiProjectionCols = [
        `${buildStatusCategorySql()} AS status_category`,
        SEG_SQL,
        ...NON_KPI_BUCKETS.flatMap((bucket) =>
          buildBucketSummaryProjectionSql(bucket).split(',\n'),
        ),
      ];
      const nonKpiSql = `
        SELECT /*+ MAX_EXECUTION_TIME(120000) */
          seg,
          ${NON_KPI_BUCKETS.flatMap((bucket) => buildSegmentAggregateColumns(bucket)).join(',\n    ')}
        FROM (
          SELECT
            ${nonKpiProjectionCols.join(',\n              ')}
          FROM ticket
          WHERE ${mainSql}
        ) scoped
        GROUP BY seg
      `;
      const nonKpiRows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
        nonKpiSql, nonKpiSql, mainParams,
      );
      const nonKpiBySeg = new Map<string, Record<string, unknown>>();
      for (const row of nonKpiRows ?? []) nonKpiBySeg.set(String(row.seg), row);

      // ── Scan 2: kpi_customer open-scope (operational bucket), group by seg ──
      const kpiWhere = await buildDailyTicketWhere(role, userId, {
        workzone,
        branchId,
        dept: undefined,
        operationalBucket: ['kpi_customer'],
      });
      const kpiMainTableWhere = buildMainTableWhere(kpiWhere, { includeClosed: false });
      const kpiFinalWhere: Prisma.ticketWhereInput = {
        AND: [kpiMainTableWhere, buildOperationalBucketWhere('kpi_customer')],
      };
      const [kpiSql, kpiParams] = buildSqlWhereClause(kpiFinalWhere);
      const kpiProjectionCols = [
        `${buildStatusCategorySql()} AS status_category`,
        SEG_SQL,
        ...buildBucketSummaryProjectionSql('kpi_customer').split(',\n'),
      ];
      const kpiQuery = `
        SELECT /*+ MAX_EXECUTION_TIME(120000) */
          seg,
          ${buildSegmentAggregateColumns('kpi_customer').join(',\n    ')}
        FROM (
          SELECT
            ${kpiProjectionCols.join(',\n              ')}
          FROM ticket
          WHERE ${kpiSql}
        ) scoped
        GROUP BY seg
      `;
      const kpiRows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
        kpiQuery, kpiQuery, kpiParams,
      );
      const kpiBySeg = new Map<string, Record<string, unknown>>();
      for (const row of kpiRows ?? []) kpiBySeg.set(String(row.seg), row);

      // ── Scan 3: close-only counts per bucket (daily filter, status=close), group by seg ──
      const closeBaseWhere = await buildDailyTicketWhere(role, userId, {
        workzone,
        branchId,
        dept: undefined,
        operationalBucket: undefined,
      });
      const closeMainTableWhere = buildMainTableWhere(closeBaseWhere, { includeClosed: true });
      const [closeSql, closeParams] = buildSqlWhereClause(closeMainTableWhere);
      const closeSelects = ALL_BUCKETS
        .map((bucket) =>
          `SUM(CASE WHEN (${buildKpiBucketFilterSql(bucket)}) AND ${buildStatusCategorySql()} = 'close' THEN 1 ELSE 0 END) AS \`${bucket}__close\``)
        .join(',\n              ');
      const closeQuery = `
        SELECT /*+ MAX_EXECUTION_TIME(120000) */
          ${SEG_SQL},
          ${closeSelects}
        FROM ticket
        WHERE ${closeSql}
        GROUP BY seg
      `;
      const closeRows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(
        closeQuery, closeQuery, closeParams,
      );
      const closeBySeg = new Map<string, Record<string, unknown>>();
      for (const row of closeRows ?? []) closeBySeg.set(String(row.seg), row);

      const all = {} as BucketSummaryMap;
      const b2c = {} as BucketSummaryMap;
      const b2b = {} as BucketSummaryMap;
      for (const bucket of NON_KPI_BUCKETS) {
        b2c[bucket] = normalizeBucketSummaryRow(nonKpiBySeg.get('b2c'), bucket);
        b2b[bucket] = normalizeBucketSummaryRow(nonKpiBySeg.get('b2b'), bucket);
        all[bucket] = normalizeBucketSummaryRow(
          mergeSegmentRows(nonKpiBySeg.get('b2c'), nonKpiBySeg.get('b2b')),
          bucket,
        );
      }
      b2c.kpi_customer = normalizeBucketSummaryRow(kpiBySeg.get('b2c'), 'kpi_customer');
      b2b.kpi_customer = normalizeBucketSummaryRow(kpiBySeg.get('b2b'), 'kpi_customer');
      all.kpi_customer = normalizeBucketSummaryRow(
        mergeSegmentRows(kpiBySeg.get('b2c'), kpiBySeg.get('b2b')),
        'kpi_customer',
      );

      const closeAllRow = mergeSegmentRows(closeBySeg.get('b2c'), closeBySeg.get('b2b'));
      const closeMap = {} as BucketSummaryMap;
      for (const bucket of ALL_BUCKETS) {
        closeMap[bucket] = {
          total: 0,
          open: 0,
          assigned: 0,
          onProgress: 0,
          pending: 0,
          close: parseCountValue(closeAllRow?.[`${bucket}__close`]),
          ffgCount: 0,
          gamasCount: 0,
          p1Count: 0,
          pPlusCount: 0,
        };
      }

      const toCardSummary = (s: BucketSummary): TicketManagementBucketSummary & { ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number } => ({
        total: s.total,
        open: s.open,
        assigned: s.assigned + s.onProgress + s.pending,
        close: s.close,
        ffgCount: s.ffgCount,
        gamasCount: s.gamasCount,
        p1Count: s.p1Count,
        pPlusCount: s.pPlusCount,
      });

      const allCard = Object.fromEntries(
        bucketDefs.map(({ bucket }) => [bucket, toCardSummary(all[bucket])]),
      ) as Record<string, TicketManagementBucketSummary & { ffgCount: number; gamasCount: number; p1Count: number; pPlusCount: number }>;
      const b2cCard = Object.fromEntries(
        bucketDefs.map(({ bucket }) => [bucket, toCardSummary(b2c[bucket])]),
      ) as Record<string, TicketManagementBucketSummary>;
      const b2bCard = Object.fromEntries(
        bucketDefs.map(({ bucket }) => [bucket, toCardSummary(b2b[bucket])]),
      ) as Record<string, TicketManagementBucketSummary>;
      const closeCard = Object.fromEntries(
        bucketDefs.map(({ bucket }) => [bucket, toCardSummary(closeMap[bucket])]),
      ) as Record<string, TicketManagementBucketSummary>;

      const totalAll = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].total, 0,
      );
      const deptB2CTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + b2cCard[bucket].total, 0,
      );
      const deptB2BTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + b2bCard[bucket].total, 0,
      );
      const unassignedTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].open, 0,
      );
      const assignedTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].assigned, 0,
      );
      const closeTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + closeCard[bucket].close, 0,
      );
      const ffgTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].ffgCount, 0,
      );
      const gamasTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].gamasCount, 0,
      );
      const p1Total = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].p1Count, 0,
      );
      const pPlusTotal = bucketDefs.reduce(
        (sum, { bucket }) => sum + allCard[bucket].pPlusCount, 0,
      );

      return {
        totals: {
          total: totalAll,
          b2c: deptB2CTotal,
          b2b: deptB2BTotal,
          unassigned: unassignedTotal,
          assigned: assignedTotal,
          close: closeTotal,
          ffgCount: ffgTotal,
          gamasCount: gamasTotal,
          p1Count: p1Total,
          pPlusCount: pPlusTotal,
        },
        cards: {
          kpiCustomer: { ...allCard.kpi_customer, close: closeCard.kpi_customer.close },
          kpiProactive: { ...allCard.kpi_proactive, close: closeCard.kpi_proactive.close },
          nonKpiUnspec: { ...allCard.non_kpi_unspec, close: closeCard.non_kpi_unspec.close },
          nonTechnical: { ...allCard.non_technical, close: closeCard.non_technical.close },
          sqmUpdate: { ...allCard.sqm_update, close: closeCard.sqm_update.close },
          obsolete: { ...allCard.obsolete, close: closeCard.obsolete.close },
        },
      };
    },
    DASHBOARD_SUMMARY_CACHE_TTL,
  );
}
