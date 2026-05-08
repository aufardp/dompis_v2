import type { JenisKey } from '@/app/config/jenis-tiket';
export type { JenisKey };

import {
  normalizeJenis as _normalizeJenis,
  getJenisConfig as _getJenisConfig,
  isB2CJenis as _isB2CJenis,
  isB2BJenis as _isB2BJenis,
  B2C_JENIS_KEYS as _B2C_JENIS_KEYS,
  B2B_JENIS_KEYS as _B2B_JENIS_KEYS,
  JENIS_TIKET_LIST,
} from '@/app/config/jenis-tiket';

import {
  CUSTOMER_TYPES as _CUSTOMER_TYPES,
  CUSTOMER_TYPE_MAP as _CUSTOMER_TYPE_MAP,
  normalizeCustomerType,
  getCustomerTypeConfig,
  getSlaHours,
  getCustomerPriority,
  type CustomerTypeConfig,
  type CustomerTypeKey,
} from '@/app/config/customer-types';

import {
  FLAG_PRIORITY,
  STATUS_PRIORITY_CONFIG,
  AGE_THRESHOLDS,
  P_PLUS_ESCALATION_HOURS,
} from '@/app/config/priority-rules';

export const normalizeJenis = _normalizeJenis;
export const getJenisConfig = _getJenisConfig;
export const isB2CJenis = _isB2CJenis;
export const isB2BJenis = _isB2BJenis;
export const B2C_JENIS_KEYS = _B2C_JENIS_KEYS;
export const B2B_JENIS_KEYS = _B2B_JENIS_KEYS;

export const CUSTOMER_TYPES = _CUSTOMER_TYPES;
export const CUSTOMER_TYPE_MAP = _CUSTOMER_TYPE_MAP;

export const JENIS_KEYS = JENIS_TIKET_LIST.map((j) => j.key);
export const JENIS_STYLES = Object.fromEntries(
  JENIS_TIKET_LIST.map((j) => [j.key, j.color])
) as Record<string, string>;
export const JENIS_LABELS = Object.fromEntries(
  JENIS_TIKET_LIST.map((j) => [j.key, j.label])
) as Record<string, string>;

export function classifyTicket(ticket: {
  jenisTiket?: string | null;
  customerSegment?: string | null;
  customerType?: string | null;
}): 'b2c' | 'b2b' {
  const normalizedJenis = normalizeJenis(ticket.jenisTiket);

  if (normalizedJenis) {
    if (B2B_JENIS_KEYS.includes(normalizedJenis)) {
      return 'b2b';
    }
    if (B2C_JENIS_KEYS.includes(normalizedJenis)) {
      return 'b2c';
    }
  }

  const segment = (ticket.customerSegment ?? '').trim().toUpperCase();
  if (segment === 'B2B') {
    return 'b2b';
  }
  if (segment === 'B2C' || segment === 'PL_TSEL') {
    return 'b2c';
  }

  const customerType = (ticket.customerType ?? '').trim().toUpperCase();
  if (customerType) {
    if (
      customerType.startsWith('DATIN_') ||
      customerType.startsWith('INDIBIZ') ||
      customerType.startsWith('RESELLER') ||
      customerType.startsWith('WIFI') ||
      customerType === 'DATIN' ||
      customerType === 'INDIBIZ' ||
      customerType === 'RESELLER'
    ) {
      return 'b2b';
    }

    if (
      customerType === 'REGULER' ||
      customerType === 'HVC_GOLD' ||
      customerType === 'HVC_PLATINUM' ||
      customerType === 'HVC_DIAMOND' ||
      customerType.startsWith('HVC_')
    ) {
      return 'b2c';
    }
  }

  return 'b2c';
}

export function getJenisStyle(raw: string | null | undefined): string {
  const config = getJenisConfig(raw);
  return config?.color ?? 'bg-slate-100 text-slate-500';
}

export {
  normalizeCustomerType,
  getCustomerTypeConfig,
  getSlaHours,
  getCustomerPriority,
  type CustomerTypeConfig,
  type CustomerTypeKey,
} from '@/app/config/customer-types';

export {
  FLAG_PRIORITY,
  STATUS_PRIORITY_CONFIG,
  AGE_THRESHOLDS,
  P_PLUS_ESCALATION_HOURS,
} from '@/app/config/priority-rules';