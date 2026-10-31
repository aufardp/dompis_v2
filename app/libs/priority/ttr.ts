// app/libs/priority/ttr.ts

import { parseWIBDateInput } from '@/app/utils/datetime';
import { normalizeCustomerType } from '@/app/config/customer-types';
import { TtrBucket, TtrState } from './types';

export const TTR_BUCKETS: TtrBucket[] = ['diamond_vvip', 'platinum', 'manja', 'reguler'] as const;

export const TTR_HOURS: Record<TtrBucket, number> = {
  diamond_vvip: 3,
  platinum: 6,
  manja: 3,
  reguler: 36,
};

export const NEAR_PERCENT = 0.1; // 10%

export interface ResolvedTtr {
  bucket: TtrBucket | null;
  deadline_at: Date | null;
  deadline_source: 'reported' | 'booking' | 'unknown';
  ttr_state: TtrState;
  remaining_ms: number | null;
  is_unknown_deadline: boolean;
  is_invalid_future_date: boolean;
}

export function resolveTtrBucket(
  ticket: {
    jenis_tiket_2: string | null;
    customer_type: string | null;
    flagging_manja: string | null;
    reported_date_dt: string | Date | null;
    booking_date: string | null;
  },
  now: Date = new Date(),
): ResolvedTtr {
  const jenis = (ticket.jenis_tiket_2 || '').toUpperCase().trim();
  const custRaw = (ticket.customer_type || '').toUpperCase().trim();
  const manjaFlag = (ticket.flagging_manja || '').toUpperCase().trim();
  const custNorm = normalizeCustomerType(ticket.customer_type);

  let bucket: TtrBucket | null = null;

  // 1. Manja (REG + flagging_manja)
  if ((jenis === 'REG' || jenis === 'REGULER') && manjaFlag) {
    bucket = 'manja';
  }
  // 2. Diamond / VVIP
  else if (custNorm === 'HVC_DIAMOND' || custRaw === 'VVIP') {
    bucket = 'diamond_vvip';
  }
  // 3. Platinum
  else if (custNorm === 'HVC_PLATINUM') {
    bucket = 'platinum';
  }
  // 4. Reguler (REG/REGULER, tanpa manja flag, bukan HVC tier)
  else if ((jenis === 'REG' || jenis === 'REGULER') && !manjaFlag) {
    bucket = 'reguler';
  }

  if (!bucket) {
    return {
      bucket: null,
      deadline_at: null,
      deadline_source: 'unknown',
      ttr_state: 'safe',
      remaining_ms: null,
      is_unknown_deadline: false,
      is_invalid_future_date: false,
    };
  }

  let baseDate: Date | null = null;
  let deadlineSource: 'reported' | 'booking' | 'unknown' = 'unknown';
  let isUnknownDeadline = false;
  let isInvalidFutureDate = false;

  if (bucket === 'manja') {
    if (ticket.booking_date && String(ticket.booking_date).trim()) {
      baseDate = parseWIBDateInput(ticket.booking_date);
      deadlineSource = 'booking';
    }
    if (!baseDate && ticket.reported_date_dt) {
      baseDate = parseWIBDateInput(ticket.reported_date_dt);
      deadlineSource = 'reported';
    }
    if (!baseDate) {
      isUnknownDeadline = true;
    }
  } else {
    if (ticket.reported_date_dt) {
      baseDate = parseWIBDateInput(ticket.reported_date_dt);
      deadlineSource = 'reported';
    } else {
      isUnknownDeadline = true;
    }
  }

  if (baseDate) {
    const diffMs = baseDate.getTime() - now.getTime();
    if (diffMs > 60 * 60 * 1000) {
      isInvalidFutureDate = true;
      baseDate = null;
    }
  }

  if (!baseDate) {
    return {
      bucket,
      deadline_at: null,
      deadline_source: deadlineSource,
      ttr_state: 'safe',
      remaining_ms: null,
      is_unknown_deadline: isUnknownDeadline,
      is_invalid_future_date: isInvalidFutureDate,
    };
  }

  const hours = TTR_HOURS[bucket];
  const deadline = new Date(baseDate.getTime() + hours * 60 * 60 * 1000);
  const remainingMs = deadline.getTime() - now.getTime();

  let ttrState: TtrState = 'safe';
  if (remainingMs <= 0) {
    ttrState = 'over';
  } else {
    const nearThresholdMs = hours * 60 * 60 * 1000 * NEAR_PERCENT;
    if (remainingMs <= nearThresholdMs) {
      ttrState = 'near';
    }
  }

  return {
    bucket,
    deadline_at: deadline,
    deadline_source: deadlineSource,
    ttr_state: ttrState,
    remaining_ms: remainingMs,
    is_unknown_deadline: isUnknownDeadline,
    is_invalid_future_date: isInvalidFutureDate,
  };
}

export function formatRemainingMs(ms: number | null): string {
  if (ms === null || ms === undefined) return 'tidak tersedia';
  if (ms >= -60000 && ms <= 60000) return 'kurang dari 1m';

  const isNegative = ms < 0;
  const absMs = Math.abs(ms);
  const hours = Math.floor(absMs / (60 * 60 * 1000));
  const minutes = Math.floor((absMs % (60 * 60 * 1000)) / (60 * 1000));

  const prefix = isNegative ? '-' : '';
  if (hours > 0) {
    return `${prefix}${hours}j ${minutes}m`;
  }
  return `${prefix}${minutes}m`;
}