import { createHash } from 'crypto';
import { ExternalRow, NormalizedExternalRow, IdentityResolution } from '../external-db/types';

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
};

function toSnakeCase(str: string): string {
  // Convert camelCase or any case to snake_case
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase();
}

export function normalizeExternalRow(row: ExternalRow, sourceTable: string): NormalizedExternalRow {
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
    const processedValue = value instanceof Date ? toMySQLDateString(value) : (value ?? null);
    normalized[normalizedKey] = processedValue;
    rawPayload[key] = processedValue;
  }

  return {
    ...normalized,
    _sourceTable: sourceTable,
    _rawPayload: rawPayload,
  } as NormalizedExternalRow;
}

export function resolveIdentity(row: NormalizedExternalRow): IdentityResolution {
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

  return {
    primaryIdentity: primaryIdentity || fallback1Identity || fallback2Identity || `unknown_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    fallback1Identity,
    fallback2Identity,
  };
}

export function computeSourceHash(row: NormalizedExternalRow): string {
  const stablePayload: Record<string, unknown> = {};

  for (const key of Object.keys(row).sort()) {
    if (key === '_sourceTable' || key === '_rawPayload') continue;
    const value = row[key as keyof NormalizedExternalRow];
    stablePayload[key] = value ?? null;
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

export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return 'UNKNOWN';

  const normalized = status.toUpperCase().trim();

  // Map all possible statuses from external DB
  const statusMap: Record<string, string> = {
    'CLOSED': 'CLOSED',
    'CLOSE': 'CLOSED',
    'BACKEND': 'BACKEND',
    'MEDIACARE': 'MEDIACARE',
    'PENDING': 'PENDING',
    'ANALYSIS': 'ANALYSIS',
    'FINALCHECK': 'FINALCHECK',
    'DRAFT': 'DRAFT',
    'OPEN': 'OPEN',
    'NEW': 'OPEN',
    'UNKNOWN': 'UNKNOWN',
  };

  return statusMap[normalized] || 'UNKNOWN';
}
