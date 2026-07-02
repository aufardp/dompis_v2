import { Prisma } from '@prisma/client';
import {
  OPERATIONAL_ACTIVE_WORKZONES,
  OPERATIONAL_KPI_CUSTOMER_SEGMENTS,
  OPERATIONAL_KPI_STATUSES,
} from '@/app/config/operational-buckets';
import { JENIS_MAP } from '@/app/config/jenis-tiket';

export type KpiBucketKey = 'all' | 'kpi_customer' | 'kpi_proactive' | 'non_kpi_unspec' | 'non_technical' | 'sqm_update' | 'obsolete';

function buildCaseInList(values: readonly string[]): string {
  const all: string[] = [];
  for (const v of values) {
    all.push(v);
    const lc = v.toLowerCase();
    if (lc !== v) all.push(lc);
    const uc = v.toUpperCase();
    if (uc !== v) all.push(uc);
  }
  const quoted = [...new Set(all)].map((s) => `'${s.replace(/'/g, "''")}'`);
  return `(${quoted.join(',')})`;
}

function buildLikeVariantsSql(fieldSql: string, values: readonly string[]): string {
  const clauses: string[] = [];
  for (const value of values) {
    const lower = value.toLowerCase().replace(/'/g, "''");
    clauses.push(`LOWER(${fieldSql}) LIKE '%${lower}%'`);
    const compact = lower.replace(/\s+/g, '');
    if (compact !== lower) {
      clauses.push(`REPLACE(LOWER(${fieldSql}), ' ', '') LIKE '%${compact}%'`);
    }
  }
  return clauses.join(' OR ');
}

const ACTIVE_WZ_SQL = buildCaseInList(OPERATIONAL_ACTIVE_WORKZONES);
const KPI_STATUSES_SQL = buildCaseInList(OPERATIONAL_KPI_STATUSES);
const KPI_SEGMENTS_SQL = buildCaseInList(OPERATIONAL_KPI_CUSTOMER_SEGMENTS);
const NOT_OBSOLETE_SQL = `(classification_path IS NULL OR classification_path != 'Z_PERMINTAAN_044')`;

const UNSPEC_SQL = (() => {
  const aliases: string[] = [];
  for (const key of ['unspec', 'unspec-b2b'] as const) {
    const config = JENIS_MAP.get(key);
    if (config?.dbAliases) {
      for (const a of config.dbAliases) {
        aliases.push(a);
        const lc = a.toLowerCase();
        if (lc !== a) aliases.push(lc);
        const uc = a.toUpperCase();
        if (uc !== a) aliases.push(uc);
      }
    }
  }
  const quoted = [...new Set(aliases)].map((s) => `'${s.replace(/'/g, "''")}'`);
  return `(${quoted.join(',')})`;
})();

function buildKpiCustomerBaseSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  const kpiCustomerJenisFilters = [
    'reguler',
    'datin',
    'non datin',
    'tsel',
    'vpn ip',
    'ccan',
    'regular',
    'dwdm',
    'digital_spbu',
    'digital spbu',
    'astinet',
    'metro-e',
    'indibiz',
    'reseller',
    'wifi-id',
  ];

  const jenisFilterSql = buildLikeVariantsSql(`${t}jenis_tiket_1`, kpiCustomerJenisFilters);

  return `LOWER(${t}source_ticket) = 'customer' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND NOT (
    LOWER(${t}jenis_tiket_1) LIKE '%unknown%'
    OR LOWER(${t}jenis_tiket_2) LIKE '%unknown%'
    OR LOWER(${t}classification_flag) LIKE '%nontechnical%'
    OR LOWER(${t}classification_flag) LIKE '%non technical%'
    OR LOWER(${t}classification_flag) LIKE '%billing%'
    OR LOWER(${t}jenis_tiket_1) LIKE '%permintaan%'
    OR LOWER(${t}jenis_tiket_1) LIKE '%billing%'
    OR LOWER(${t}jenis_tiket_1) LIKE '%infracare%'
    OR LOWER(${t}jenis_tiket_1) LIKE '%digital_spbu%'
    OR LOWER(${t}jenis_tiket_1) LIKE '%digital spbu%'
    OR LOWER(${t}jenis_tiket_2) LIKE '%digital_spbu%'
    OR LOWER(${t}jenis_tiket_2) LIKE '%digital spbu%'
  ) AND (${jenisFilterSql})`;
}

function buildKpiProactiveSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `LOWER(${t}source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND (${t}summary IS NULL OR ${t}summary NOT LIKE '[SQM-UPDATE]%') AND (LOWER(${t}jenis_tiket_1) LIKE '%sqm%' OR LOWER(${t}jenis_tiket_1) LIKE '%sqm-ccan%')`;
}

function buildNonKpiUnspecSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `LOWER(${t}source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND ${t}jenis_tiket_2 IN ${UNSPEC_SQL}`;
}

function buildNonTechnicalSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `(${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)}) AND (
    (
      LOWER(${t}source_ticket) IN ('customer','proactive') AND (
        LOWER(${t}classification_flag) LIKE '%nontechnical%'
        OR LOWER(${t}classification_flag) LIKE '%non technical%'
        OR LOWER(${t}classification_flag) LIKE '%billing%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%unknown%'
        OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%unknown%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%permintaan%'
        OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%permintaan%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%infracare%'
        OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%infracare%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%billing%'
        OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%billing%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%digital_spbu%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%digital spbu%'
        OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%digitalspbu%'
        OR LOWER(${t}jenis_tiket_1) LIKE '%non numbering%'
        OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%nonnumbering%'
        OR LOWER(${t}jenis_tiket_2) LIKE '%digital_spbu%'
        OR LOWER(${t}jenis_tiket_2) LIKE '%digital spbu%'
        OR REPLACE(LOWER(${t}jenis_tiket_2), ' ', '') LIKE '%digitalspbu%'
        OR LOWER(${t}jenis_tiket_2) LIKE '%unknown%'
        OR REPLACE(LOWER(${t}jenis_tiket_2), ' ', '') LIKE '%unknown%'
        OR LOWER(${t}symptom) LIKE '%z_nn_01_001%'
      )
    )
    OR ${t}jenis_tiket_1 IS NULL
    OR ${t}jenis_tiket_1 = ''
    OR ${t}jenis_tiket_1 = ' '
    OR LOWER(${t}jenis_tiket_1) LIKE '%unknown%'
    OR REPLACE(LOWER(${t}jenis_tiket_1), ' ', '') LIKE '%unknown%'
    OR LOWER(${t}jenis_tiket_2) LIKE '%digital_spbu%'
    OR LOWER(${t}jenis_tiket_2) LIKE '%digital spbu%'
    OR REPLACE(LOWER(${t}jenis_tiket_2), ' ', '') LIKE '%digitalspbu%'
    OR LOWER(${t}jenis_tiket_2) LIKE '%unknown%'
    OR REPLACE(LOWER(${t}jenis_tiket_2), ' ', '') LIKE '%unknown%'
  )`;
}

function buildSqmUpdateSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `LOWER(${t}source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND ${t}summary LIKE '[SQM-UPDATE]%' AND (LOWER(${t}jenis_tiket_1) LIKE '%sqm%' OR LOWER(${t}jenis_tiket_1) LIKE '%sqm-ccan%')`;
}

function buildObsoleteSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `${t}classification_path = 'Z_PERMINTAAN_044'`;
}

/** Full bucket filter SQL (without leading AND). OR's regulerOnly for kpi_customer. */
export function buildKpiBucketFilterSql(bucket: KpiBucketKey, tbl: string = ''): string {
  switch (bucket) {
    case 'kpi_customer':
      return buildKpiCustomerBaseSql(tbl);
    case 'kpi_proactive':
      return buildKpiProactiveSql(tbl);
    case 'non_kpi_unspec':
      return buildNonKpiUnspecSql(tbl);
    case 'non_technical':
      return buildNonTechnicalSql(tbl);
    case 'sqm_update':
      return buildSqmUpdateSql(tbl);
    case 'obsolete':
      return buildObsoleteSql(tbl);
    default:
      return buildKpiCustomerBaseSql(tbl);
  }
}

/** Daily filter + MainTableWhere SQL (with table alias). Includes leading AND. */
export function buildDailyFilterSql(today: string, tbl: string = ''): Prisma.Sql {
  const t = tbl ? `${tbl}.` : '';
  return Prisma.sql`
    AND (
      (${Prisma.raw(t)}sync_date = ${today} AND ${Prisma.raw(t)}status != 'closed')
      OR (${Prisma.raw(t)}sync_date = ${today} AND ${Prisma.raw(t)}status = 'closed' AND ${Prisma.raw(t)}closed_at >= ${today + ' 00:00:00'})
      OR (${Prisma.raw(t)}sync_date = ${today} AND LOWER(${Prisma.raw(t)}status_update) = 'close' AND ${Prisma.raw(t)}status = 'closed')
      OR (${Prisma.raw(t)}pending_dompis IS NOT NULL AND ${Prisma.raw(t)}pending_dompis != '' AND ${Prisma.raw(t)}status != 'closed')
    )
    AND (
      ${Prisma.raw(t)}status = 'closed'
      OR (
        (${Prisma.raw(t)}status_update IS NULL OR LOWER(${Prisma.raw(t)}status_update) != 'close')
        AND (${Prisma.raw(t)}worklog_summary IS NULL OR LOWER(${Prisma.raw(t)}worklog_summary) != 'tech closed')
      )
    )
  `;
}

/** CASE expressions for summary query (includes reguler_only column). */
export function buildKpiSummaryCaseSql(tbl: string = ''): string {
  const customerCase = `SUM(CASE WHEN ${buildKpiCustomerBaseSql(tbl)} THEN 1 ELSE 0 END) AS kpi_customer`;
  const proactiveCase = `SUM(CASE WHEN ${buildKpiProactiveSql(tbl)} THEN 1 ELSE 0 END) AS kpi_proactive`;
  const unspecCase = `SUM(CASE WHEN ${buildNonKpiUnspecSql(tbl)} THEN 1 ELSE 0 END) AS non_kpi_unspec`;
  const nonTechnicalCase = `SUM(CASE WHEN ${buildNonTechnicalSql(tbl)} THEN 1 ELSE 0 END) AS non_technical`;
  const sqmUpdateCase = `SUM(CASE WHEN ${buildSqmUpdateSql(tbl)} THEN 1 ELSE 0 END) AS sqm_update`;
  const obsoleteCase = `SUM(CASE WHEN ${buildObsoleteSql(tbl)} THEN 1 ELSE 0 END) AS obsolete`;
  const regulerCase = `SUM(CASE WHEN LOWER(${tbl ? `${tbl}.` : ''}jenis_tiket_1) IN ('reguler','regular','reg','REGULER','REGULAR','REG') THEN 1 ELSE 0 END) AS reguler_only`;

  return [sqmUpdateCase, customerCase, proactiveCase, unspecCase, nonTechnicalCase, regulerCase, obsoleteCase].join(',');
}
