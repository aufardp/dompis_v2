import { Prisma } from '@prisma/client';
import {
  OPERATIONAL_ACTIVE_WORKZONES,
  OPERATIONAL_KPI_CUSTOMER_SEGMENTS,
  OPERATIONAL_KPI_STATUSES,
} from '@/app/config/operational-buckets';
import { JENIS_MAP } from '@/app/config/jenis-tiket';
import { isSqmUpdateReasonSql } from '@/lib/sqm-update';

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

// Builder di bawah ini (buildKpiCustomerBaseSql dst.) adalah logika LAMA
// (LIKE-chain per baris) yang digantikan oleh kolom generated
// `operational_bucket`/`kpi_seg` (lihat migration
// 20260913070000_add_operational_bucket) untuk buildKpiBucketFilterSql/
// buildKpiSummaryCaseSql di bawah. Tetap diexport & tidak dihapus — dipakai
// untuk validasi (bandingkan hasil LIKE-chain vs kolom generated) dan
// sebagai fallback kalau kolom generated ternyata salah pada suatu edge case.
export function buildKpiCustomerBaseSql(tbl: string): string {
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

export function buildKpiProactiveSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `LOWER(${t}source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND NOT ${isSqmUpdateReasonSql(tbl)} AND (LOWER(${t}jenis_tiket_1) LIKE '%sqm%' OR LOWER(${t}jenis_tiket_1) LIKE '%sqm-ccan%')`;
}

export function buildNonKpiUnspecSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `LOWER(${t}source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND ${t}jenis_tiket_2 IN ${UNSPEC_SQL}`;
}

export function buildNonTechnicalSql(tbl: string): string {
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

export function buildSqmUpdateSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `LOWER(${t}source_ticket) = 'proactive' AND ${NOT_OBSOLETE_SQL.replace(/classification_path/g, `${t}classification_path`)} AND ${isSqmUpdateReasonSql(tbl)} AND (LOWER(${t}jenis_tiket_1) LIKE '%sqm%' OR LOWER(${t}jenis_tiket_1) LIKE '%sqm-ccan%')`;
}

export function buildObsoleteSql(tbl: string): string {
  const t = tbl ? `${tbl}.` : '';
  return `${t}classification_path = 'Z_PERMINTAAN_044'`;
}

/**
 * Full bucket filter SQL (without leading AND).
 *
 * Dulu ini merangkai LIKE-chain per bucket (lihat buildKpiCustomerBaseSql
 * dkk. di atas) yang dievaluasi per baris pada setiap request — 10-30s+
 * untuk tabel `ticket` penuh. Sekarang tinggal bandingkan kolom generated
 * `operational_bucket` (lihat migration 20260913070000_add_operational_bucket),
 * yang MySQL hitung otomatis di setiap baris saat ditulis (bukan saat dibaca)
 * dan bisa dipakai index (`idx_ticket_operational_bucket`).
 */
export function buildKpiBucketFilterSql(bucket: KpiBucketKey, tbl: string = ''): string {
  const t = tbl ? `${tbl}.` : '';
  // 'all' bukan salah satu dari 6 bucket sungguhan — perilaku lama (switch
  // default) memperlakukannya sama seperti kpi_customer, dipertahankan di sini.
  const key: Exclude<KpiBucketKey, 'all'> = bucket === 'all' ? 'kpi_customer' : bucket;
  return `${t}operational_bucket = '${key}'`;
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

/**
 * CASE expressions for summary query (includes reguler_only column).
 * Sama seperti buildKpiBucketFilterSql — dulu 6x LIKE-chain per baris,
 * sekarang cukup bandingkan kolom generated `operational_bucket`.
 */
export function buildKpiSummaryCaseSql(tbl: string = ''): string {
  const t = tbl ? `${tbl}.` : '';
  const bucketCase = (bucket: Exclude<KpiBucketKey, 'all'>) =>
    `SUM(CASE WHEN ${t}operational_bucket = '${bucket}' THEN 1 ELSE 0 END) AS ${bucket}`;
  const regulerCase = `SUM(CASE WHEN LOWER(${t}jenis_tiket_1) IN ('reguler','regular','reg','REGULER','REGULAR','REG') THEN 1 ELSE 0 END) AS reguler_only`;

  return [
    bucketCase('sqm_update'),
    bucketCase('kpi_customer'),
    bucketCase('kpi_proactive'),
    bucketCase('non_kpi_unspec'),
    bucketCase('non_technical'),
    regulerCase,
    bucketCase('obsolete'),
  ].join(',');
}
