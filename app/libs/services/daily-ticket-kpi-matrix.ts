import { getOrSetCache } from '@/lib/cache';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { resolveEffectiveFlagging } from '@/app/libs/flagging-manja';
import {
  KPI_SUMMARY_BUCKETS,
  type TicketFilters,
  type BucketSummary,
  type BucketSummaryMap,
  type BucketSummaryMatrix,
  type TicketManagementOverviewSummary,
  buildSqlWhereClause,
  buildStatusCategorySql,
  buildKpiBucketSummaryCacheKey,
  queryRawWithOptionalIndex,
} from './daily-ticket-helpers';
import {
  applyCustomerBucketSyncDateFilter,
  buildDailyTicketWhere,
  buildMainTableWhere,
} from './daily-ticket-where';

function emptySummary(): BucketSummary {
  return { total: 0, open: 0, assigned: 0, onProgress: 0, pending: 0, close: 0,
    ffgCount: 0, gamasCount: 0, p1Count: 0, pPlusCount: 0 };
}

function emptyBuckets(): BucketSummaryMap {
  return Object.fromEntries(KPI_SUMMARY_BUCKETS.map(bucket => [bucket, emptySummary()])) as BucketSummaryMap;
}

export async function getKpiBucketSummaryMatrix(
  role: string,
  userId: number,
  filters?: TicketFilters,
  workzone?: string,
  branchId?: number | string,
): Promise<BucketSummaryMatrix> {
  const scopedFilters = { ...filters, workzone: workzone ?? filters?.workzone, branchId: branchId ?? filters?.branchId };
  const cacheKey = `daily_tickets:bucket_matrix:v2:${buildKpiBucketSummaryCacheKey(role, userId, scopedFilters)}`;
  return getOrSetCache(cacheKey, async () => {
    const where = await buildDailyTicketWhere(role, userId, {
      ...scopedFilters, dept: undefined, operationalBucket: undefined,
    });
    applyCustomerBucketSyncDateFilter(where);
    const [sql, params] = buildSqlWhereClause(buildMainTableWhere(where, {
      includeClosed: filters?.includeClosed === true,
    }));
    const query = withMaxExecutionTime(`
      SELECT operational_bucket AS bucket, kpi_seg AS seg, booking_date, flagging_manja,
        COUNT(*) AS total,
        SUM(CASE WHEN ${buildStatusCategorySql()} = 'open' THEN 1 ELSE 0 END) AS \`open\`,
        SUM(CASE WHEN ${buildStatusCategorySql()} = 'assigned' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN ${buildStatusCategorySql()} = 'on_progress' THEN 1 ELSE 0 END) AS onProgress,
        SUM(CASE WHEN ${buildStatusCategorySql()} = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN ${buildStatusCategorySql()} = 'close' THEN 1 ELSE 0 END) AS \`close\`,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(guarantee_status, ''))) = 'guarantee' THEN 1 ELSE 0 END) AS ffgCount,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(ticket_id_gamas, ''))) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamasCount
      FROM ticket WHERE ${sql} AND operational_bucket IS NOT NULL
      GROUP BY operational_bucket, kpi_seg, booking_date, flagging_manja
    `);
    const rows = await queryRawWithOptionalIndex<Array<Record<string, unknown>>>(query, query, params);
    const matrix: BucketSummaryMatrix = { all: emptyBuckets(), b2c: emptyBuckets(), b2b: emptyBuckets() };
    for (const row of rows) {
      const bucket = KPI_SUMMARY_BUCKETS.find(key => key === row.bucket);
      if (!bucket) continue;
      const flag = resolveEffectiveFlagging(String(row.flagging_manja ?? '').trim().toUpperCase(), row.booking_date as string | null);
      row.p1Count = flag === 'P1' ? Number(row.total) : 0;
      row.pPlusCount = flag === 'P+' ? Number(row.total) : 0;
      for (const key of Object.keys(emptySummary()) as Array<keyof BucketSummary>) {
        const value = Number(row[key] ?? 0);
        matrix.all[bucket][key] += value;
        if (row.seg === 'b2c' || row.seg === 'b2b') matrix[row.seg][bucket][key] += value;
      }
    }
    return matrix;
  }, 15);
}

export async function getTicketManagementOverviewSummary(
  role: string,
  userId: number,
  workzone?: string,
  branchId?: number | string,
): Promise<TicketManagementOverviewSummary> {
  // Keep the two broad aggregate scans from competing with each other and
  // with the projection writer on the production database.
  const active = await getKpiBucketSummaryMatrix(role, userId, { workzone, branchId });
  const closed = await getKpiBucketSummaryMatrix(role, userId, {
    workzone,
    branchId,
    includeClosed: true,
    ticketStatus: CLOSE_STATUS_VALUES,
  });
  const card = (bucket: typeof KPI_SUMMARY_BUCKETS[number]) => {
    const summary = active.all[bucket];
    return { ...summary, assigned: summary.assigned + summary.onProgress + summary.pending, close: closed.all[bucket].close };
  };
  const cards: TicketManagementOverviewSummary['cards'] = {
    kpiCustomer: card('kpi_customer'), kpiProactive: card('kpi_proactive'), nonKpiUnspec: card('non_kpi_unspec'),
    nonTechnical: card('non_technical'), sqmUpdate: card('sqm_update'), obsolete: card('obsolete'),
  };
  const sum = (buckets: BucketSummaryMap, key: keyof BucketSummary) =>
    KPI_SUMMARY_BUCKETS.reduce((total, bucket) => total + buckets[bucket][key], 0);
  return {
    totals: {
      total: sum(active.all, 'total'), b2c: sum(active.b2c, 'total'), b2b: sum(active.b2b, 'total'),
      unassigned: sum(active.all, 'open'), assigned: sum(active.all, 'assigned') + sum(active.all, 'onProgress') + sum(active.all, 'pending'),
      close: sum(closed.all, 'close'), ffgCount: sum(active.all, 'ffgCount'), gamasCount: sum(active.all, 'gamasCount'),
      p1Count: sum(active.all, 'p1Count'), pPlusCount: sum(active.all, 'pPlusCount'),
    },
    cards,
  };
}
