import {
  normalizeJenis,
  B2C_JENIS_KEYS,
  B2B_JENIS_KEYS,
} from '@/app/config/jenis-tiket';

import {
  normalizeCustomerType,
} from '@/app/config/customer-types';

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
