/**
 * Cell spec types shared between the rekap table/cards and the ticket-member
 * modal. Every clickable count cell resolves to a `RekapCellSpec` that the
 * modal sends to `GET /api/dashboard/rekap-workorder/tickets`.
 */

export type RekapStatusFilter = 'open' | 'close' | 'all';

export interface RekapCellScope {
  area?: string;
  sa?: string;
  workzone?: string;
}

export interface RekapCellSpec {
  /** Stable key for the modal (drives query cache + open/close). */
  key: string;
  /** View-level bucket context ('all' | 'kpi_customer' | ...). */
  bucket: string;
  /** Segment:key detail, e.g. 'b2c:reguler', 'sqm:opn', 'obsolete:obsolete'. */
  detail?: string;
  status: RekapStatusFilter;
  /** Use the legacy customer operational bucket (Customer cells / B2C+B2B). */
  legacyCustomer?: boolean;
  scope: RekapCellScope;
  /** Human-readable label rendered in the modal header. */
  label: string;
}

export type BucketCellKey =
  | 'kpiCustomer'
  | 'kpiProactive'
  | 'nonKpiUnspec'
  | 'nonTechnical'
  | 'sqmUpdate'
  | 'obsolete';

export const BUCKET_LABELS: Record<BucketCellKey, string> = {
  kpiCustomer: 'Customer',
  kpiProactive: 'Proactive',
  nonKpiUnspec: 'Unspec',
  nonTechnical: 'Non Technical',
  sqmUpdate: 'SQM Update',
  obsolete: 'Obsolete',
};

const BUCKET_TO_VIEW: Record<BucketCellKey, string> = {
  kpiCustomer: 'kpi_customer',
  kpiProactive: 'kpi_proactive',
  nonKpiUnspec: 'non_kpi_unspec',
  nonTechnical: 'non_technical',
  sqmUpdate: 'sqm_update',
  obsolete: 'obsolete',
};

function scopeKey(scope: RekapCellScope): string {
  return [scope.area ?? '', scope.sa ?? '', scope.workzone ?? ''].join('/');
}

function scopeLabel(scope: RekapCellScope): string {
  const parts: string[] = [];
  if (scope.workzone) parts.push(`WZ ${scope.workzone}`);
  else if (scope.sa) parts.push(`SA ${scope.sa}`);
  else if (scope.area) parts.push(`Area ${scope.area}`);
  return parts.join(' · ');
}

const STATUS_LABEL: Record<RekapStatusFilter, string> = {
  open: 'Open',
  close: 'Close',
  all: 'Total',
};

/**
 * Builds a spec for a summary cell (Open / Close / Total column) in the table.
 * In all-mode the members are every ticket in scope; in a detail view the
 * members are the tickets of that view's bucket.
 */
export function buildSummaryCellSpec(
  detailMode: string | undefined,
  status: RekapStatusFilter,
  scope: RekapCellScope,
): RekapCellSpec {
  const bucket = detailMode ?? 'all';
  const bucketLabel = detailMode
    ? (BUCKET_LABELS[
        Object.keys(BUCKET_TO_VIEW).find((k) => BUCKET_TO_VIEW[k as BucketCellKey] === detailMode) as BucketCellKey
      ] ?? detailMode)
    : null;
  return {
    key: `summary|${bucket}|${status}|${scopeKey(scope)}`,
    bucket,
    status,
    legacyCustomer: bucket === 'kpi_customer',
    scope,
    label: [
      bucketLabel ? `${bucketLabel} — ${STATUS_LABEL[status]}` : STATUS_LABEL[status],
      scopeLabel(scope),
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

/** Builds a spec for a bucket cell (Open/Close columns of a bucket group). */
export function buildBucketCellSpec(
  bucketKey: BucketCellKey,
  status: RekapStatusFilter,
  scope: RekapCellScope,
): RekapCellSpec {
  const bucket = BUCKET_TO_VIEW[bucketKey];
  return {
    key: `bucket|${bucketKey}|${status}|${scopeKey(scope)}`,
    bucket,
    status,
    legacyCustomer: bucketKey === 'kpiCustomer',
    scope,
    label: `${BUCKET_LABELS[bucketKey]} · ${STATUS_LABEL[status]}${
      scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''
    }`,
  };
}

/**
 * Builds a spec for a detail cell (B2C/B2B/SQM/Obsolete/Unspec columns).
 * `segment` mirrors the table group segment; `key` is the column key.
 * `subLabel` is 'Open' | 'Close' | 'OPN' | 'CLS' | 'UPD'.
 */
export function buildDetailCellSpec(
  detailMode: string,
  segment: string,
  key: string,
  subLabel: string,
  scope: RekapCellScope,
): RekapCellSpec {
  const status: RekapStatusFilter =
    subLabel.toUpperCase() === 'OPN' || subLabel.toUpperCase() === 'OPEN'
      ? 'open'
      : subLabel.toUpperCase() === 'CLS' || subLabel.toUpperCase() === 'CLOSE'
        ? 'close'
        : 'all';

  if (segment === 'obsolete') {
    return {
      key: `detail|obsolete|${subLabel}|${scopeKey(scope)}`,
      bucket: 'obsolete',
      detail: 'obsolete:obsolete',
      status,
      scope,
      label: `Obsolete · ${STATUS_LABEL[status]}${
        scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''
      }`,
    };
  }

  if (segment === 'sqm') {
    const keyRaw = subLabel.toUpperCase() === 'OPN'
      ? 'opn'
      : subLabel.toUpperCase() === 'CLS'
        ? 'cls'
        : 'upd';
    return {
      key: `detail|sqm|${keyRaw}|${scopeKey(scope)}`,
      bucket: 'kpi_customer',
      detail: `sqm:${keyRaw}`,
      status,
      scope,
      label: `SQM · ${keyRaw.toUpperCase()}${
        scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''
      }`,
    };
  }

  if (segment === 'gamas') {
    const keyRaw =
      subLabel.trim().toUpperCase() === 'CLOSE' ||
      subLabel.trim().toUpperCase() === 'CLS'
        ? 'close'
        : 'open';
    return {
      key: `detail|gamas|${keyRaw}|${scopeKey(scope)}`,
      // Sengaja 'all', bukan 'kpi_customer' — tiket GAMAS (source_ticket
      // = 'GAMAS') tidak pernah lolos filter bucket kpi_customer (union
      // customer/proactive/sqm_update), jadi bucket filter di-bypass dan
      // pembatasan sepenuhnya diserahkan ke klausa `detail` di bawah.
      bucket: 'all',
      detail: `gamas:${keyRaw}`,
      status,
      scope,
      label: `GAMAS · ${STATUS_LABEL[status]}${
        scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''
      }`,
    };
  }

  if (segment === 'unspec') {
    const keyRaw = key === 'unspec-b2b' ? 'b2b' : 'b2c';
    return {
      key: `detail|unspec|${keyRaw}|${subLabel}|${scopeKey(scope)}`,
      bucket: 'non_kpi_unspec',
      detail: `unspec:${keyRaw}`,
      status,
      scope,
      label: `Unspec · ${keyRaw.toUpperCase()} · ${STATUS_LABEL[status]}${
        scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''
      }`,
    };
  }

  // Unspec view renders unspec keys inside the B2C / B2B group segments.
  if (detailMode === 'non_kpi_unspec') {
    const keyRaw = segment === 'b2b' ? 'b2b' : 'b2c';
    return {
      key: `detail|unspec|${keyRaw}|${subLabel}|${scopeKey(scope)}`,
      bucket: 'non_kpi_unspec',
      detail: `unspec:${keyRaw}`,
      status,
      scope,
      label: `Unspec · ${keyRaw.toUpperCase()} · ${STATUS_LABEL[status]}${
        scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''
      }`,
    };
  }

  // B2C / B2B segment cells. In the customer view B2C uses customer types;
  // B2B uses jenis. In proactive/sqm views both use jenis.
  const isCustomerView = detailMode === 'kpi_customer';
  return {
    key: `detail|${segment}|${key}|${subLabel}|${scopeKey(scope)}`,
    bucket: detailMode,
    detail: `${segment}:${key}`,
    status,
    legacyCustomer: isCustomerView,
    scope,
    label: `${segment.toUpperCase()} · ${key.replace(/-/g, ' ').toUpperCase()} · ${
      STATUS_LABEL[status]
    }${scopeLabel(scope) ? ` · ${scopeLabel(scope)}` : ''}`,
  };
}

/**
 * Builds a spec for a B2B/B2C segment cell (Open B2B / Open B2C / Close B2B /
 * Close B2C columns) — plain segment split, independent of jenis-tiket.
 */
export function buildSegmentCellSpec(
  detailMode: string | undefined,
  status: RekapStatusFilter,
  segment: 'b2b' | 'b2c',
  scope: RekapCellScope,
): RekapCellSpec {
  const bucket = detailMode ?? 'all';
  return {
    key: `segment|${bucket}|${segment}|${status}|${scopeKey(scope)}`,
    bucket,
    detail: `segment:${segment}`,
    status,
    legacyCustomer: bucket === 'kpi_customer',
    scope,
    label: [
      `${segment.toUpperCase()} · ${STATUS_LABEL[status]}`,
      scopeLabel(scope),
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

/** Builds a spec for a priority chip in the header overview. */
export function buildChipCellSpec(
  chipBucket: BucketCellKey | 'total',
  detailMode: string,
): RekapCellSpec {
  if (chipBucket === 'total') {
    return {
      key: `chip|total|${detailMode}`,
      bucket: detailMode === 'all' ? 'all' : detailMode,
      status: 'all',
      legacyCustomer: detailMode === 'kpi_customer',
      scope: {},
      label: `Total · ${detailMode === 'all' ? 'All' : detailMode}`,
    };
  }
  const bucket = BUCKET_TO_VIEW[chipBucket];
  return {
    key: `chip|${chipBucket}|${detailMode}`,
    bucket,
    status: 'all',
    legacyCustomer: chipBucket === 'kpiCustomer',
    scope: {},
    label: `${BUCKET_LABELS[chipBucket]} · Total`,
  };
}

/**
 * Builds a spec for a summary tile (Open / Close / Total WO) in the header.
 * Header tiles come from `workboardSummary` which aggregates every bucket,
 * so the members are always the whole scope regardless of the selected view.
 */
export function buildTileCellSpec(
  tileKey: 'open' | 'close' | 'total',
): RekapCellSpec {
  const status: RekapStatusFilter =
    tileKey === 'open' ? 'open' : tileKey === 'close' ? 'close' : 'all';
  return buildSummaryCellSpec(undefined, status, {});
}

export function buildCellQueryParams(spec: RekapCellSpec): URLSearchParams {
  const params = new URLSearchParams();
  params.set('bucket', spec.bucket);
  if (spec.detail) params.set('detail', spec.detail);
  params.set('status', spec.status);
  if (spec.legacyCustomer) params.set('legacy', '1');
  if (spec.scope.area) params.set('area', spec.scope.area);
  if (spec.scope.sa) params.set('sa', spec.scope.sa);
  if (spec.scope.workzone) params.set('wz', spec.scope.workzone);
  return params;
}