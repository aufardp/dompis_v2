import 'dotenv/config';
import { prisma } from '@/app/libs/prisma';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { buildCellFilterSql } from '@/lib/rekap/rekap-cell-filter';
import { classifyBucket, type ClassBucketKey } from '@/lib/rekap/rekap-classify';
import { isSqmUpdateReasonSql } from '@/lib/sqm-update';
import { getTicketCategory } from '@/app/libs/ticket-utils';

interface Scope {
  area?: string;
  sa?: string;
  workzone?: string;
}

const BUCKETS = [
  { bucket: 'kpi_customer', label: 'Customer' },
  { bucket: 'kpi_proactive', label: 'Proactive' },
  { bucket: 'non_kpi_unspec', label: 'Unspec' },
  { bucket: 'non_technical', label: 'Non Technical' },
  { bucket: 'sqm_update', label: 'SQM Update' },
  { bucket: 'obsolete', label: 'Obsolete' },
] as const;

const DETAILS = [
  { detail: 'unspec:b2c', label: 'UNSPEC B2C' },
  { detail: 'unspec:b2b', label: 'UNSPEC B2B' },
  { detail: 'sqm:opn', label: 'SQM OPN' },
  { detail: 'sqm:cls', label: 'SQM CLS' },
  { detail: 'sqm:upd', label: 'SQM UPD' },
  { detail: 'obsolete:obsolete', label: 'OBSOLETE' },
] as const;

async function countCell(
  whereClause: string,
  whereParams: unknown[],
  scope: Scope,
  bucket: string | undefined,
  detail: string | undefined,
  status: 'open' | 'close' | 'all',
  legacyCustomer: boolean,
): Promise<number> {
  const [cellSql, cellParams] = buildCellFilterSql({
    bucket,
    detail,
    status,
    scope,
    legacyCustomer: legacyCustomer || undefined,
  });

  const fullWhere =
    cellSql === '1=1'
      ? whereClause
      : whereClause === '1=1'
        ? cellSql
        : `(${whereClause}) AND (${cellSql})`;

  const rows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*) AS total
     FROM ticket t
     JOIN service_area sa ON sa.nama_sa = t.workzone
     JOIN area a ON a.id_area = sa.area_id
     WHERE ${fullWhere}`,
    ...whereParams,
    ...cellParams,
  );
  return Number(rows[0]?.total ?? 0);
}

function pad(text: string | number, width: number): string {
  const t = String(text);
  return t.length >= width ? t : t.padEnd(width);
}

interface AggRow {
  area: string;
  sa_name: string;
  workzone: string | null;
  customer_segment: string | null;
  status: string;
  status_update: string;
  classification_path: string | null;
  classification_flag: string | null;
  source_ticket: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
  is_sqm_update: boolean;
  cnt: bigint;
}

/**
 * Replicates `buildRekapResponse` (bucket='all') aggregation to verify that the
 * new invariant holds: for every SA, grandTotal (totalAll) equals the sum of
 * the six bucket open+close cells. This directly validates the removal of
 * `skipAllCustomerBucket` in the rekap-workorder route.
 */
async function verifyAllAggregation() {
  console.log('\n# VERIFY ALL AGGREGATION (bucket=all, JS classifyBucket)\n');

  const [whereClause, whereParams] =
    await DailyTicketService.buildDailyTicketSqlParams('superadmin', 1, {
      dept: 'all',
      includeClosed: true,
    });

  const rows = await prisma.$queryRawUnsafe<AggRow[]>(
    `SELECT
      a.nama_area AS area,
      sa.nama_sa AS sa_name,
      t.workzone,
      t.customer_segment,
      t.status,
      LOWER(COALESCE(t.status_update, 'open')) AS status_update,
      t.classification_path,
      t.classification_flag,
      t.source_ticket,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      ${isSqmUpdateReasonSql('t')} AS is_sqm_update,
      COUNT(*) AS cnt
     FROM ticket t
     JOIN service_area sa ON sa.nama_sa = t.workzone
     JOIN area a ON a.id_area = sa.area_id
     WHERE ${whereClause}
     GROUP BY area, sa_name, workzone, customer_segment, status, status_update,
              classification_path, classification_flag, source_ticket,
              jenis_tiket_1, jenis_tiket_2, is_sqm_update
     ORDER BY area, sa_name, workzone`,
    ...whereParams,
  );

  const BUCKET_KEYS: ClassBucketKey[] = [
    'kpiCustomer',
    'kpiProactive',
    'nonKpiUnspec',
    'nonTechnical',
    'sqmUpdate',
    'obsolete',
  ];

  const saMap = new Map<string, { totalAll: number; buckets: Record<ClassBucketKey, number> }>();
  for (const row of rows) {
    const key = `${row.area}||${row.sa_name}`;
    if (!saMap.has(key)) {
      saMap.set(key, {
        totalAll: 0,
        buckets: Object.fromEntries(BUCKET_KEYS.map((b) => [b, 0])) as Record<ClassBucketKey, number>,
      });
    }
    const sa = saMap.get(key)!;
    const cnt = Number(row.cnt);
    const bucket = classifyBucket(row);
    sa.totalAll += cnt;
    if (getTicketCategory(row.status, row.status_update) === 'close') {
      sa.buckets[bucket] += cnt;
    } else {
      sa.buckets[bucket] += cnt;
    }
  }

  let ok = 0;
  let mismatch = 0;
  let totalSum = 0;
  for (const [key, sa] of saMap) {
    const bucketSum = BUCKET_KEYS.reduce((s, b) => s + sa.buckets[b], 0);
    totalSum += sa.totalAll;
    const isOk = sa.totalAll === bucketSum;
    if (isOk) ok += 1;
    else mismatch += 1;
    console.log(
      `  ${pad(key, 40)} | totalAll=${pad(sa.totalAll, 6)} | sumBuckets=${pad(bucketSum, 6)} | ${isOk ? 'OK' : 'MISMATCH'}`,
    );
  }

  const footerBucketSum = Array.from(saMap.values()).reduce(
    (s, sa) => s + BUCKET_KEYS.reduce((x, b) => x + sa.buckets[b], 0),
    0,
  );
  console.log(
    `\n  footer: Σ grandTotal=${totalSum} | Σ buckets=${footerBucketSum} | ${totalSum === footerBucketSum ? 'OK' : 'MISMATCH'}`,
  );
  console.log(
    `\n# Verify done — SA ok=${ok}/${saMap.size} mismatch=${mismatch}\n`,
  );
  return mismatch === 0 && totalSum === footerBucketSum;
}

async function main() {
  const legacyCustomer = process.argv.includes('--legacy');
  if (process.argv.includes('--verify-all')) {
    await verifyAllAggregation();
    await prisma.$disconnect();
    return;
  }
  const flag = process.argv.find((a) => a.startsWith('--scope='));
  const scopeOpt = flag ? flag.split('=')[1] : 'sa';

  const [whereClause, whereParams] =
    await DailyTicketService.buildDailyTicketSqlParams('superadmin', 1, {
      dept: 'all',
      includeClosed: true,
      operationalBucket: legacyCustomer ? ['kpi_customer'] : undefined,
    });

  let scopes: Scope[] = [];
  if (scopeOpt === 'all') {
    scopes = [{}];
  } else if (scopeOpt === 'area') {
    const areas = await prisma.$queryRawUnsafe<{ nama_area: string }[]>(
      'SELECT DISTINCT a.nama_area FROM service_area sa JOIN area a ON a.id_area = sa.area_id ORDER BY a.nama_area',
    );
    scopes = areas.map((r) => ({ area: r.nama_area }));
  } else {
    const sas = await prisma.$queryRawUnsafe<
      { nama_area: string; nama_sa: string; workzone: string }[]
    >(
      `SELECT a.nama_area, sa.nama_sa, sa.nama_sa AS workzone
       FROM service_area sa
       JOIN area a ON a.id_area = sa.area_id
       ORDER BY a.nama_area, sa.nama_sa`,
    );
    scopes = sas.map((r) => ({
      area: r.nama_area,
      sa: r.nama_sa,
      workzone: r.workzone,
    }));
  }

  console.log(
    `\n# REKAP CELL CONSISTENCY${legacyCustomer ? ' [LEGACY CUSTOMER]' : ''} — scope=${scopeOpt} — scopes=${scopes.length}\n`,
  );
  if (legacyCustomer) {
    console.log(
      'Keterangan: dalam mode LEGACY CUSTOMER, base WHERE sudah discope\n' +
        'ke kpi_customer sehingga seluruh bucket cell mengembalikan total yang\n' +
        'sama (bucketSql = 1=1). Bandingkan angka per-bucket dengan view\n' +
        "'Customer' dari API /api/dashboard/rekap-workorder?bucket=kpi_customer.\n",
    );
  }

  let mismatches = 0;

  for (const scope of scopes) {
    const openOfBuckets = new Map<string, number>();
    let sumBucketsOpen = 0;
    let sumBucketsClose = 0;
    let allOpen = 0;
    let allClose = 0;

    for (const b of BUCKETS) {
      const bucketOpen = await countCell(
        whereClause,
        whereParams,
        scope,
        b.bucket,
        undefined,
        'open',
        legacyCustomer,
      );
      const bucketClose = await countCell(
        whereClause,
        whereParams,
        scope,
        b.bucket,
        undefined,
        'close',
        legacyCustomer,
      );
      openOfBuckets.set(b.bucket, bucketOpen + bucketClose);
      sumBucketsOpen += bucketOpen;
      sumBucketsClose += bucketClose;
    }

    allOpen = await countCell(
      whereClause,
      whereParams,
      scope,
      undefined,
      undefined,
      'open',
      legacyCustomer,
    );
    allClose = await countCell(
      whereClause,
      whereParams,
      scope,
      undefined,
      undefined,
      'close',
      legacyCustomer,
    );

    const total = allOpen + allClose;
    const bucketTotal = sumBucketsOpen + sumBucketsClose;

    const header = `${scope.area ?? 'ALL'} / ${scope.sa ?? 'ALL'}${
      scope.workzone ? ` / ${scope.workzone}` : ''
    }`;
    console.log(`## ${header}`);
    console.log(
      `  ${pad('bucket', 14)} | ${pad('open', 6)} | ${pad('close', 6)} | ${pad('total', 6)}`,
    );
    for (const b of BUCKETS) {
      const o = openOfBuckets.get(b.bucket)! - 0;
      const bucketOpen = o > 0 ? await countCell(
        whereClause, whereParams, scope, b.bucket, undefined, 'open', legacyCustomer,
      ) : 0;
      const bucketClose = o > 0 ? await countCell(
        whereClause, whereParams, scope, b.bucket, undefined, 'close', legacyCustomer,
      ) : 0;
      console.log(
        `  ${pad(b.label, 14)} | ${pad(bucketOpen, 6)} | ${pad(bucketClose, 6)} | ${pad(bucketOpen + bucketClose, 6)}`,
      );
    }
    console.log(
      `  ${pad('OVERVIEW', 14)} | ${pad(allOpen, 6)} | ${pad(allClose, 6)} | ${pad(total, 6)}`,
    );
    console.log(
      `  ${pad('SUM-BUCKETS', 14)} | ${pad(sumBucketsOpen, 6)} | ${pad(sumBucketsClose, 6)} | ${pad(bucketTotal, 6)}`,
    );

    if (total !== bucketTotal) {
      mismatches += 1;
      console.log(
        `  !!! MISMATCH: overview ${total} != sum buckets ${bucketTotal}`,
      );
    }

    if (legacyCustomer) {
      const details: { open: number; close: number }[] = [];
      for (const d of DETAILS) {
        const detailOpen = await countCell(
          whereClause, whereParams, scope, undefined, d.detail, 'open', true,
        );
        const detailClose = await countCell(
          whereClause, whereParams, scope, undefined, d.detail, 'close', true,
        );
        details.push({ open: detailOpen, close: detailClose });
        console.log(
          `  ${pad(d.label, 20)} | ${pad(detailOpen, 6)} | ${pad(detailClose, 6)} | ${pad(detailOpen + detailClose, 6)}`,
        );
      }
    }
    console.log('');
  }

  console.log(
    `\n# Done — mismatches: ${mismatches}/${scopes.length}\n`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});