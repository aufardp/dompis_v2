import { getTicketCategory } from '@/app/libs/ticket-utils';
import { normalizeJenis } from '@/app/config/jenis-tiket';

/**
 * Shared JS classification for rekap workorder cells.
 * Mirrors the aggregation inside `buildRekapResponse` in
 * `app/api/dashboard/rekap-workorder/route.ts` so the ticket-member modal lists
 * exactly the tickets counted in a given cell.
 */

export interface RekapCellSpec {
  bucket?: string;
  detail?: string;
  status: 'open' | 'close' | 'all';
  legacyCustomer?: boolean;
  scope?: { area?: string; sa?: string; workzone?: string };
}

export type ClassBucketKey =
  | 'kpiCustomer'
  | 'kpiProactive'
  | 'nonKpiUnspec'
  | 'nonTechnical'
  | 'sqmUpdate'
  | 'obsolete';

export const KPI_CUSTOMER_JENIS = new Set([
  'reguler',
  'datin',
  'non-datin',
  'tsel',
  'vpn-ip',
  'dwdm',
  'astinet',
  'metro-e',
  'indibiz',
  'reseller',
  'wifi-id',
]);

export function normalizeBucketText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeBucketCompact(value: string | null | undefined): string {
  return normalizeBucketText(value).replace(/\s+/g, '');
}

/**
 * Normalisasi jenis untuk detail B2B di tabel rekap. vpn-ip digabung ke datin.
 * Satu-satunya sumber kebenaran untuk agregasi detail B2B (route.ts) dan
 * membership sel (matchesDetail / buildDetailClause).
 */
export function normalizeB2BJenis(value?: string | null): string | null {
  const key = normalizeJenis(value);
  return key === 'vpn-ip' ? 'datin' : key;
}

function textContainsAny(
  value: string | null | undefined,
  terms: readonly string[],
): boolean {
  const lower = normalizeBucketText(value);
  const compact = normalizeBucketCompact(value);
  return terms.some((term) => {
    const needle = term.toLowerCase();
    return (
      lower.includes(needle) || compact.includes(needle.replace(/\s+/g, ''))
    );
  });
}

function isNonTechnicalFlag(value: string | null | undefined): boolean {
  const lower = normalizeBucketText(value);
  return (
    lower.includes('nontechnical') ||
    lower.includes('non technical') ||
    lower.includes('billing')
  );
}

export function classifyBucket(row: {
  source_ticket?: string | null;
  classification_path?: string | null;
  is_sqm_update?: boolean | number;
  jenis_tiket_1?: string | null;
  jenis_tiket_2?: string | null;
  classification_flag?: string | null;
}): ClassBucketKey {
  const st = (row.source_ticket ?? '').toUpperCase();
  const path = row.classification_path ?? '';
  const isSqmUpdate = Number(row.is_sqm_update) === 1;
  const isCust = st === 'CUSTOMER';
  const isPro = st === 'PROACTIVE';

  if (path === 'Z_PERMINTAAN_044') return 'obsolete';

  const jt1Raw = normalizeBucketText(row.jenis_tiket_1);
  const jt1 = normalizeJenis(row.jenis_tiket_1);
  const jt2 = normalizeJenis(row.jenis_tiket_2);
  const isSqmJt1 =
    jt1Raw.includes('sqm') || jt1 === 'sqm' || jt1 === 'sqm-ccan';

  const isNonTech =
    (isCust || isPro) &&
    (isNonTechnicalFlag(row.classification_flag) ||
      jt1 === 'unknown' ||
      jt1 === 'permintaan' ||
      jt1 === 'infracare' ||
      jt1 === 'billing' ||
      jt1 === 'digital-spbu' ||
      jt1 === 'non-numbering' ||
      jt2 === 'digital-spbu' ||
      jt1Raw === '' ||
      jt1Raw.includes('unknown'));
  if (isNonTech) return 'nonTechnical';

  if (isPro) {
    if (isSqmJt1 && isSqmUpdate) return 'sqmUpdate';
    if (isSqmJt1 && !isSqmUpdate) return 'kpiProactive';
    if (jt1 === 'unspec' || jt1 === 'unspec-b2b') return 'nonKpiUnspec';
  }

  if (
    isCust &&
    jt1 &&
    KPI_CUSTOMER_JENIS.has(jt1) &&
    !textContainsAny(row.jenis_tiket_1, [
      'unknown',
      'permintaan',
      'billing',
      'infracare',
      'digital_spbu',
      'digital spbu',
    ]) &&
    !textContainsAny(row.jenis_tiket_2, [
      'unknown',
      'digital_spbu',
      'digital spbu',
    ])
  ) {
    return 'kpiCustomer';
  }

  return 'nonTechnical';
}

const BUCKET_VIEW_MEMBERS: Record<string, ClassBucketKey[]> = {
  kpi_proactive: ['kpiProactive'],
  non_kpi_unspec: ['nonKpiUnspec'],
  non_technical: ['nonTechnical'],
  sqm_update: ['sqmUpdate'],
  obsolete: ['obsolete'],
};

const CLASS_BY_BUCKET: Record<string, ClassBucketKey> = {
  kpi_customer: 'kpiCustomer',
  kpi_proactive: 'kpiProactive',
  non_kpi_unspec: 'nonKpiUnspec',
  non_technical: 'nonTechnical',
  sqm_update: 'sqmUpdate',
  obsolete: 'obsolete',
};

function getSegKey(customer_segment?: string | null): 'b2c' | 'b2b' {
  const seg = (customer_segment ?? '').toUpperCase();
  return seg === 'DCS' || seg === 'PL-TSEL' ? 'b2c' : 'b2b';
}

export function matchesBucket(row: {
  source_ticket?: string | null;
  classification_path?: string | null;
  is_sqm_update?: boolean | number;
  jenis_tiket_1?: string | null;
  jenis_tiket_2?: string | null;
  classification_flag?: string | null;
}, bucket: string | undefined): boolean {
  if (!bucket || bucket === 'all') return true;
  return classifyBucket(row) === CLASS_BY_BUCKET[bucket];
}

export function isInView(row: Parameters<typeof classifyBucket>[0], bucket: string | undefined): boolean {
  if (!bucket || bucket === 'all') return true;
  if (bucket === 'kpi_customer') {
    const source = normalizeBucketText(row.source_ticket);
    if (source === 'customer' && classifyBucket(row) !== 'obsolete') return true;
    const cls = classifyBucket(row);
    return cls === 'kpiProactive' || cls === 'sqmUpdate';
  }
  const members = BUCKET_VIEW_MEMBERS[bucket];
  if (!members) return matchesBucket(row, bucket);
  return members.includes(classifyBucket(row));
}

const CUSTOMER_TYPE_KEYS = ['DIAMOND', 'PLATINUM', 'GOLD', 'REGULER'] as const;

function customerTypeMatch(
  customer_type?: string | null,
  type?: string,
): boolean {
  const ct = (customer_type ?? '').toUpperCase();
  if (type === 'DIAMOND') return ct.includes('DIAMOND');
  if (type === 'PLATINUM')
    return ct.includes('PLATINUM') && !ct.includes('DIAMOND');
  if (type === 'GOLD')
    return (
      ct.includes('GOLD') &&
      !ct.includes('DIAMOND') &&
      !ct.includes('PLATINUM')
    );
  return !ct.includes('DIAMOND') && !ct.includes('PLATINUM') && !ct.includes('GOLD');
}

function isSqmJenis(row: {
  jenis_tiket_1?: string | null;
}): boolean {
  const jt1 = normalizeBucketText(row.jenis_tiket_1);
  return jt1.includes('sqm') || jt1.includes('sqm-ccan');
}

function sqmBase(row: {
  source_ticket?: string | null;
  classification_path?: string | null;
  jenis_tiket_1?: string | null;
}): boolean {
  return (
    normalizeBucketText(row.source_ticket) === 'proactive' &&
    (row.classification_path ?? '') !== 'Z_PERMINTAAN_044' &&
    isSqmJenis(row)
  );
}

function isSqmUpdateSummary(row: { summary?: string | null }): boolean {
  return String(row.summary ?? '').toLowerCase().startsWith('[sqm-update]');
}

export function matchesDetail(
  row: {
    customer_segment?: string | null;
    customer_type?: string | null;
    jenis_tiket_1?: string | null;
    jenis_tiket_2?: string | null;
    jenis_tiket?: string | null;
    source_ticket?: string | null;
    classification_path?: string | null;
    summary?: string | null;
    status?: string | null;
    status_update?: string | null;
  },
  bucket: string | undefined,
  detail: string,
): boolean {
  const [seg, keyRaw] = detail.split(':');
  const segName = (seg ?? '').trim();
  const key = (keyRaw ?? '').trim();
  const isClose = getTicketCategory(row.status, row.status_update) === 'close';

  if (segName === 'obsolete') {
    return (row.classification_path ?? '') === 'Z_PERMINTAAN_044';
  }

  if (segName === 'sqm') {
    if (!key || key === 'opn')
      return sqmBase(row) && !isSqmUpdateSummary(row) && !isClose;
    if (key === 'cls') return sqmBase(row) && isClose;
    if (key === 'upd') return sqmBase(row) && isSqmUpdateSummary(row) && !isClose;
    return false;
  }

  if (segName === 'unspec') {
    const segKey = getSegKey(row.customer_segment);
    return key === 'b2b' ? segKey === 'b2b' : segKey === 'b2c';
  }

  if (segName === 'b2c' || segName === 'b2b') {
    if (getSegKey(row.customer_segment) !== segName) return false;

    const isCustomerTypeKey =
      bucket === 'kpi_customer' &&
      segName === 'b2c' &&
      (CUSTOMER_TYPE_KEYS as readonly string[]).includes(key.toUpperCase());
    if (isCustomerTypeKey) {
      return customerTypeMatch(row.customer_type, key.toUpperCase());
    }

    const detailJenisSource =
      bucket === 'kpi_customer' && segName === 'b2b'
        ? row.jenis_tiket_1
        : row.jenis_tiket_1 ?? row.jenis_tiket_2 ?? row.jenis_tiket;
    const normalizedSource =
      segName === 'b2b'
        ? normalizeB2BJenis(detailJenisSource)
        : normalizeJenis(detailJenisSource);
    return (
      normalizedSource === key.toLowerCase().replace(/[\s_]/g, '-')
    );
  }

  return false;
}

/**
 * JS membership check for a cell. Returns true when the ticket is counted in
 * the cell's number. Legacy `Customer` cells (all-mode table) are handled by
 * SQL (`operationalBucket`) and always return true here.
 */
export function filterTicketByCell(
  row: Parameters<typeof matchesDetail>[0] & {
    source_ticket?: string | null;
    classification_path?: string | null;
    is_sqm_update?: boolean | number;
    jenis_tiket_1?: string | null;
    jenis_tiket_2?: string | null;
    classification_flag?: string | null;
  },
  spec: RekapCellSpec,
): boolean {
  const isClose = getTicketCategory(row.status, row.status_update) === 'close';
  if (spec.status === 'open' && isClose) return false;
  if (spec.status === 'close' && !isClose) return false;

  if (spec.legacyCustomer) return true;

  if (spec.detail) {
    return isInView(row, spec.bucket) && matchesDetail(row, spec.bucket, spec.detail);
  }
  return matchesBucket(row, spec.bucket);
}