import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { JENIS_MAP } from '@/app/config/jenis-tiket';
import {
  buildKpiBucketFilterSql,
  type KpiBucketKey,
} from '@/app/libs/services/kpi-bucket-sql';

export type RekapStatusFilter = 'open' | 'close' | 'all';

export interface RekapCellScope {
  area?: string;
  sa?: string;
  workzone?: string;
}

export interface RekapCellFilterInput {
  bucket?: string;
  detail?: string;
  status?: RekapStatusFilter;
  scope?: RekapCellScope;
  q?: string;
  legacyCustomer?: boolean;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function quoteList(values: readonly string[]): string {
  const set = new Set(values);
  return `(${Array.from(set)
    .map((v) => `'${escapeSql(v)}'`)
    .join(',')})`;
}

const B2C_SEG_SQL = `t.customer_segment IN ('DCS','PL-TSEL')`;
const B2B_SEG_SQL = `(t.customer_segment IS NULL OR t.customer_segment NOT IN ('DCS','PL-TSEL'))`;

const CLOSE_STATUS_SQL = quoteList(
  CLOSE_STATUS_VALUES.map((v) => v.toUpperCase()),
);
const NOT_OBSOLETE_SQL = `(t.classification_path IS NULL OR t.classification_path != 'Z_PERMINTAAN_044')`;
const SQM_JENIS_SQL = `(LOWER(t.jenis_tiket_1) LIKE '%sqm%' OR LOWER(t.jenis_tiket_1) LIKE '%sqm-ccan%')`;
const SQM_UPDATE_SUMMARY_SQL = `t.summary LIKE '[SQM-UPDATE]%'`;

const buildCloseClause = (): string =>
  `UPPER(TRIM(COALESCE(t.status, ''))) IN ${CLOSE_STATUS_SQL}`;
const buildOpenClause = (): string => `NOT (${buildCloseClause()})`;

/**
 * Bucket membership filter (mirrors `filterRekapRowsByBucket` + `buildRekapBucketFilterSql`).
 * `all` returns a passthrough; `kpi_customer` includes customer + proactive + sqm-update rows
 * so the SQM overlay columns match the customer view.
 */
export function buildRekapBucketFilterSql(bucket: string): string {
  if (bucket === 'all') return '1=1';
  if (bucket === 'kpi_customer') {
    return `(
      (LOWER(t.source_ticket) = 'customer' AND (t.classification_path IS NULL OR t.classification_path != 'Z_PERMINTAAN_044'))
      OR (${buildKpiBucketFilterSql('kpi_proactive', 't')})
      OR (${buildKpiBucketFilterSql('sqm_update', 't')})
    )`;
  }
  return buildKpiBucketFilterSql(bucket as KpiBucketKey, 't');
}

export function buildHierarchyClause(
  scope: RekapCellScope | undefined,
): [string, unknown[]] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (scope?.area) {
    clauses.push('a.nama_area = ?');
    params.push(scope.area);
  }
  if (scope?.sa) {
    clauses.push('sa.nama_sa = ?');
    params.push(scope.sa);
  }
  if (scope?.workzone) {
    clauses.push('t.workzone = ?');
    params.push(scope.workzone);
  }
  if (clauses.length === 0) return ['1=1', []];
  return [clauses.join(' AND '), params];
}

export function buildStatusClause(status: RekapStatusFilter | undefined): string {
  if (status === 'close') return buildCloseClause();
  if (status === 'open') return buildOpenClause();
  return '1=1';
}

export function buildSearchClause(q: string | undefined): [string, unknown[]] {
  const term = String(q ?? '').trim();
  if (!term) return ['1=1', []];
  const like = `%${term}%`;
  return [
    `(t.incident LIKE ? OR t.summary LIKE ? OR t.customer_name LIKE ? OR t.service_no LIKE ? OR t.contact_name LIKE ?)`,
    [like, like, like, like, like],
  ];
}

function buildCustomerTypeClause(type: string): string {
  const ct = `UPPER(COALESCE(t.customer_type, ''))`;
  if (type === 'DIAMOND') return `${ct} LIKE '%DIAMOND%'`;
  if (type === 'PLATINUM')
    return `${ct} LIKE '%PLATINUM%' AND ${ct} NOT LIKE '%DIAMOND%'`;
  if (type === 'GOLD')
    return `${ct} LIKE '%GOLD%' AND ${ct} NOT LIKE '%DIAMOND%' AND ${ct} NOT LIKE '%PLATINUM%'`;
  return `${ct} NOT LIKE '%DIAMOND%' AND ${ct} NOT LIKE '%PLATINUM%' AND ${ct} NOT LIKE '%GOLD%'`;
}

function buildJenisNormalizedClause(key: string, columns: string[]): string {
  const normalizedKey = (key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]/g, '-');
  const config = JENIS_MAP.get(normalizedKey);
  const aliases = config?.dbAliases ?? [];

  const nom = (col: string) =>
    `LOWER(TRIM(REPLACE(REPLACE(t.${col}, ' ', '-'), '_', '-')))`;

  const byColumn = columns.map((col) => {
    const parts: string[] = [];
    if (aliases.length > 0) {
      const normalizedAliases = [...new Set(
        aliases.map((a) => a.trim().toLowerCase().replace(/[\s_]/g, '-')),
      )];
      parts.push(`${nom(col)} IN ${quoteList(normalizedAliases)}`);
    }
    if (normalizedKey) {
      parts.push(`${nom(col)} LIKE '${escapeSql(normalizedKey)}-%'`);
    }
    return parts.length > 0 ? `(${parts.join(' OR ')})` : null;
  });

  const valid = byColumn.filter((c): c is string => c != null);
  return valid.length > 0 ? valid.join(' OR ') : '1=0';
}

function buildSqmBaseClause(): string {
  return `(LOWER(t.source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL} AND ${SQM_JENIS_SQL})`;
}

function buildUpdateClause(): string {
  return `(${buildSqmBaseClause()} AND ${SQM_UPDATE_SUMMARY_SQL})`;
}

/**
 * Detail/segment membership filter that mirrors the JS classification inside
 * `buildRekapResponse` (customer type split, jenis normalization, unspec, SQM overlay).
 */
export function buildDetailClause(
  detail: string | undefined,
  bucket: string | undefined,
): string {
  if (!detail) return '1=1';
  const [seg, keyRaw] = detail.split(':');
  const segName = (seg ?? '').trim();
  const key = (keyRaw ?? '').trim();

  if (segName === 'obsolete') {
    return `t.classification_path = 'Z_PERMINTAAN_044'`;
  }

  if (segName === 'sqm') {
    if (!key || key === 'opn') {
      return `(${buildSqmBaseClause()} AND NOT ${SQM_UPDATE_SUMMARY_SQL} AND ${buildOpenClause()})`;
    }
    if (key === 'cls') {
      return `(${buildSqmBaseClause()} AND ${buildCloseClause()})`;
    }
    if (key === 'upd') {
      return `(${buildUpdateClause()} AND ${buildOpenClause()})`;
    }
    return '1=1';
  }

  if (segName === 'unspec') {
    return key === 'b2b' ? B2B_SEG_SQL : B2C_SEG_SQL;
  }

  if (segName === 'b2c' || segName === 'b2b') {
    const segFilter = segName === 'b2c' ? B2C_SEG_SQL : B2B_SEG_SQL;
    const isCustomerTypeKey =
      bucket === 'kpi_customer' &&
      segName === 'b2c' &&
      ['DIAMOND', 'PLATINUM', 'GOLD', 'REGULER'].includes(key.toUpperCase());
    if (isCustomerTypeKey) {
      return `(${segFilter} AND ${buildCustomerTypeClause(key.toUpperCase())})`;
    }
    const columns =
      bucket === 'kpi_customer' && segName === 'b2b'
        ? ['jenis_tiket_1']
        : ['jenis_tiket_1', 'jenis_tiket_2', 'jenis_tiket'];
    const detailKeys =
      segName === 'b2b' && key === 'datin' ? ['datin', 'vpn-ip'] : [key];
    const jenisClause = detailKeys
      .map((k) => buildJenisNormalizedClause(k, columns))
      .filter((c): c is string => c != null)
      .join(' OR ');
    return `(${segFilter} AND (${jenisClause}))`;
  }

  return '1=1';
}

/**
 * Combined per-cell SQL fragment (without leading AND) used by the ticket-member
 * endpoint. Returns [sql, params] to append after `AND`.
 */
export function buildCellFilterSql(input: RekapCellFilterInput): [string, unknown[]] {
  const parts: string[] = [];
  const params: unknown[] = [];

  let bucketSql = buildRekapBucketFilterSql(input.bucket ?? 'all');
  if (input.legacyCustomer) {
    // Legacy customer cells use `operationalBucket: ['kpi_customer']` which is
    // already applied by the base `buildDailyTicketSqlParams` scope. Only the
    // detail/segment clause (if any) is needed here.
    bucketSql = '1=1';
  }
  if (bucketSql !== '1=1') parts.push(`(${bucketSql})`);

  const [hierarchySql, hierarchyParams] = buildHierarchyClause(input.scope);
  if (hierarchySql !== '1=1') {
    parts.push(`(${hierarchySql})`);
    params.push(...hierarchyParams);
  }

  const statusSql = buildStatusClause(input.status);
  if (statusSql !== '1=1') parts.push(statusSql);

  const detailSql = buildDetailClause(input.detail, input.bucket);
  if (detailSql !== '1=1') parts.push(`(${detailSql})`);

  const [searchSql, searchParams] = buildSearchClause(input.q);
  if (searchSql !== '1=1') {
    parts.push(searchSql);
    params.push(...searchParams);
  }

  if (parts.length === 0) return ['1=1', []];
  return [parts.join(' AND '), params];
}