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

const DATE_FIELDS = new Set([
  'reported_date',
  'date_modified',
  'booking_date',
  'status_date',
  'resolve_date',
]);

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

function normalizeDateString(value: string): string {
  // Normalize ISO 8601 date string (e.g. "2026-07-15T08:50:03+07:00")
  // to MySQL datetime format in WIB: "2026-07-15 08:50:03".
  const trimmed = value.trim();
  if (!trimmed.includes('T') && !trimmed.includes('Z')) return value;

  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const withTz = hasTz ? trimmed : `${trimmed}+07:00`;
  const parsed = new Date(withTz);
  if (isNaN(parsed.getTime())) return value;

  // Convert to WIB (UTC+7) for display
  const wib = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wib.getUTCDate()).padStart(2, '0');
  const h = String(wib.getUTCHours()).padStart(2, '0');
  const min = String(wib.getUTCMinutes()).padStart(2, '0');
  const s = String(wib.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
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
  Last_Work_Log_Date: 'last_update_worklog',
  last_updated_work_log: 'worklog_summary',
  Last_Updated_Work_Log: 'worklog_summary',
  'Closed/Reopen_By': 'closed_reopen_by',
  C_REALM: 'realm',
  C_TSC_RESULT: 'tsc_result',
  C_SCC_RESULT: 'scc_result',
  // ALL_CAPS fields — toSnakeCase inserts underscore before every letter
  ROOTCAUSE: 'cause',
  RESOLUTION: 'resolution',
  GAUL: 'gaul',
  CUSTOMER_TYPE: 'customer_type',
  INCIDENT_DOMAIN: 'incident_domain',
  TTR_END_TO_END: 'ttr_end_to_end',
  EXTERNALSYSTEM_TICKETID: 'external_ticket_id',
  CONTACT_EMAIL: 'contact_email',
  // C_ prefix fields — toSnakeCase produces broken casing
  C_GUARANTE_STATUS: 'guarantee_status',
  C_Resolve_Date: 'resolve_date',
  C_Booking_Date: 'booking_date',
  C_Description_Assigment: 'description_assignment',
  C_PRIORITY: 'reported_priority',
  // PascalCase with underscore — toSnakeCase inserts underscore per capital mid-word
  Customer_Name: 'customer_name',
  Customer_Segment: 'customer_segment',
  Customer_ID: 'customer_id',
  Service_ID: 'service_id',
  Service_No: 'service_no',
  Service_Type: 'service_type',
  Owner_Group: 'owner_group',
  Reported_Date: 'reported_date',
  Status_Date: 'status_date',
  TTR_Customer: 'ttr_customer',
  TTR_Nasional: 'ttr_nasional',
  TTR_Regional: 'ttr_region',
  TTR_Witel: 'ttr_witel',
  TTR_Mitra: 'ttr_mitra',
  TTR_Agent: 'ttr_agent',
  Ttr_Pending: 'ttr_pending',
  Impacted_Site: 'impacted_site',
  // Field name mismatch — bridge name differs from target
  Source: 'source_ticket',
  Regional: 'region',
  Resolved_By: 'closed_by',
  Last_Update_Ticket: 'date_modified',
  ASSIGN_TO: 'technician',
  Induk_Gamas: 'ticket_id_gamas',
  Induk_gamas: 'ticket_id_gamas',
  Actual_Solution: 'description_actual_solution',
  RK: 'rk_information',
  // camelCase / no separator
  reportedpriority: 'reported_priority',
}

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

    // Convert Date objects and ISO 8601 date strings to MySQL datetime format
    const processedValue =
      value instanceof Date
        ? toMySQLDateString(value)
        : DATE_FIELDS.has(normalizedKey) && typeof value === 'string'
          ? normalizeDateString(value)
          : (value ?? null);
    normalized[normalizedKey] = processedValue;
    rawPayload[key] = processedValue;
  }

  // Normalize various SQM summary prefixes to consistent format
  // so bucket classification (which checks startsWith('[SQM-UPDATE]')) works.
  const summary = normalized.summary;
  if (typeof summary === 'string') {
    normalized.summary = summary
      .replace(/\[SQM_UPDATE\]/gi, '[SQM-UPDATE]')
      .replace(/\[SQM-UPDATE\]\s*\[SQM-UPDATE\]/gi, '[SQM-UPDATE]');
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
