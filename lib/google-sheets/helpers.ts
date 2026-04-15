import { formatInTimeZone } from 'date-fns-tz';

const WIB = 'Asia/Jakarta';

export function nowWIB(): string {
  return new Date().toLocaleString('id-ID', {
    timeZone: WIB,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Returns today's date in WIB timezone as YYYY-MM-DD string.
 * This ensures sync dates are always correct for Indonesia Western Time,
 * even during midnight UTC rollover (e.g., 00:30 WIB = 17:30 UTC previous day).
 */
export function todayWIB(): string {
  return formatInTimeZone(new Date(), WIB, 'yyyy-MM-dd');
}
