import { createHash } from 'crypto';
import {
  ExternalRow,
  NormalizedExternalRow,
  IdentityResolution,
} from '../external-db/types';

export interface StrictIdentityResolution {
  primaryIdentity: string | null;
  fallback1Identity: string | null;
  fallback2Identity: string | null;
  valid: boolean;
  reason?: string;
}

function toMySQLDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    const h = String(value.getHours()).padStart(2, '0');
    const min = String(value.getMinutes()).padStart(2, '0');
    const s = String(value.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
  return String(value);
}

const FIELDS_TO_REMOVE = new Set([
  'col_0',
  'col_83',
  'c_parent_id',
  'status_validasi',
  'id',
  'created_at',
  'updated_at',
]);

// Direct mapping: external column → internal column (snake_case)
const COLUMN_MAPPING: Record<string, string> = {
  cause_problem: 'cause',
  c_street_address: 'street_address',
  external_ticket_tier3: 'external_ticket_tier_3',
  datemodified: 'date_modified',
  // QOSMIC Bridge: bridge sends PascalCase/snake_case mixed names
  // that toSnakeCase() cannot map to the correct internal field.
  Last_Work_Log_Date: 'worklog_summary',
  last_updated_work_log: 'last_update_worklog',
  Last_Updated_Work_Log: 'last_update_worklog',
  'Closed/Reopen_By': 'closed_reopen_by',
  C_REALM: 'realm',
  C_TSC_RESULT: 'tsc_result',
  C_SCC_RESULT: 'scc_result',
};

function toSnakeCase(str: string): string {
  // Convert camelCase or PascalCase/PascalCase_With_Underscore to snake_case.
  //
  // FIX (QOSMIC Bridge integration): field seperti "Status_Date" dari bridge
  // sebelumnya jadi "status__date" (underscore ganda) karena regex di bawah
  // menyisipkan '_' sebelum setiap huruf kapital TANPA memperhitungkan
  // underscore yang sudah ada di string aslinya. Kolom internal/downstream
  // (validateExternalRow, resolveIdentityStrict, dst) mengharapkan
  // "status_date" (satu underscore) — jadi collapse underscore berturut-turut
  // di akhir. Ini aman utk kolom lama (all-lowercase dari MySQL langsung)
  // karena mereka tidak pernah punya underscore ganda ke depannya.
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .replace(/_+/g, '_')
    .toLowerCase();
}

export function normalizeExternalRow(
  row: ExternalRow,
  sourceTable: string,
): NormalizedExternalRow {
  const normalized: Record<string, unknown> = {};
  const rawPayload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (FIELDS_TO_REMOVE.has(key)) {
      continue;
    }

    // Check if this column has a direct mapping
    const hasDirectMapping = !!COLUMN_MAPPING[key];

    // If direct mapping exists, use it; otherwise convert to snake_case
    const normalizedKey = hasDirectMapping
      ? COLUMN_MAPPING[key]
      : toSnakeCase(key);

    // Convert Date objects to MySQL datetime string without timezone conversion
    const processedValue =
      value instanceof Date ? toMySQLDateString(value) : (value ?? null);
    normalized[normalizedKey] = processedValue;
    rawPayload[key] = processedValue;
  }

  return {
    ...normalized,
    _sourceTable: sourceTable,
    _rawPayload: rawPayload,
  } as NormalizedExternalRow;
}

export function resolveIdentity(
  row: NormalizedExternalRow,
): IdentityResolution {
  const resolution = resolveIdentityStrict(row);
  return {
    primaryIdentity: resolution.primaryIdentity ?? '',
    fallback1Identity: resolution.fallback1Identity,
    fallback2Identity: resolution.fallback2Identity,
  };
}

export function resolveIdentityStrict(
  row: NormalizedExternalRow,
): StrictIdentityResolution {
  const incident = String(row.incident || '').trim() || null;
  const externalTicketId = String(row.external_ticket_id || '').trim() || null;
  const serviceNo = String(row.service_no || '').trim() || null;
  const customerId = String(row.customer_id || '').trim() || null;
  const reportedDate = row.reported_date
    ? String(row.reported_date).trim()
    : null;

  let primaryIdentity: string | null = null;
  let fallback1Identity: string | null = null;
  let fallback2Identity: string | null = null;

  if (incident) {
    primaryIdentity = incident;
  }

  if (externalTicketId && serviceNo) {
    fallback1Identity = `ext_${externalTicketId}_${serviceNo}`;
  }

  if (customerId && serviceNo && reportedDate) {
    fallback2Identity = `cust_${customerId}_${serviceNo}_${reportedDate}`;
  }

  const resolved = primaryIdentity || fallback1Identity || fallback2Identity;
  return {
    primaryIdentity: resolved,
    fallback1Identity,
    fallback2Identity,
    valid: Boolean(resolved),
    reason: resolved
      ? undefined
      : 'missing stable identity: incident, external_ticket_id+service_no, or customer_id+service_no+reported_date',
  };
}

export function computeSourceHash(row: NormalizedExternalRow): string {
  const stablePayload: Record<string, unknown> = {};

  for (const key of Object.keys(row).sort()) {
    if (key === '_sourceTable' || key === '_rawPayload') continue;
    const value = row[key as keyof NormalizedExternalRow];
    stablePayload[key] =
      value instanceof Date ? toMySQLDateString(value) : (value ?? null);
  }

  return createHash('sha256')
    .update(JSON.stringify(stablePayload))
    .digest('hex')
    .substring(0, 64);
}

export function parseDate(dateValue: string | null | undefined): Date | null {
  if (!dateValue) return null;

  try {
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warn';
}

export function validateExternalRow(
  row: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!row || typeof row !== 'object') {
    errors.push({
      field: '_row',
      message: 'Row is null or not an object',
      severity: 'error',
    });
    return errors;
  }

  const incident = row.incident || row.Incident;
  if (!incident || String(incident).trim() === '') {
    errors.push({
      field: 'incident',
      message: 'Missing required field: incident',
      severity: 'error',
    });
  }

  if (incident && String(incident).length > 191) {
    errors.push({
      field: 'incident',
      message: `incident too long (${String(incident).length} chars, max 191)`,
      severity: 'error',
    });
  }

  for (const dateField of [
    'reported_date',
    'date_modified',
    'booking_date',
    'status_date',
    'resolve_date',
  ]) {
    const val = row[dateField];
    if (val !== null && val !== undefined && val !== '') {
      const d = new Date(String(val));
      if (isNaN(d.getTime())) {
        errors.push({
          field: dateField,
          message: `Invalid date value: ${val}`,
          severity: 'warn',
        });
      }
    }
  }

  const workzone = row.workzone || row.Workzone || row.workzone_name;
  if (!workzone || String(workzone).trim() === '') {
    errors.push({
      field: 'workzone',
      message: 'Missing workzone',
      severity: 'warn',
    });
  }

  return errors;
}

export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'UNKNOWN';

  const normalized = status.toUpperCase().trim();

  // Map all possible statuses from external DB
  const statusMap: Record<string, string> = {
    CLOSED: 'CLOSED',
    CLOSE: 'CLOSED',
    SALAMSIM: 'SALAMSIM',
    MEDIACARE: 'MEDIACARE',
    RESOLVED: 'RESOLVED',
    FINALCHECK: 'FINALCHECK',
    BACKEND: 'BACKEND',
    PENDING: 'PENDING',
    ANALYSIS: 'ANALYSIS',
    DRAFT: 'DRAFT',
    NEW: 'NEW',
    OPEN: 'OPEN',
    UNKNOWN: 'UNKNOWN',
  };

  return statusMap[normalized] || 'UNKNOWN';
}
