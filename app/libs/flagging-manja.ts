import { nowWib, toWibDateString } from '@/lib/timezone';
import { parseWIBDateInput } from '@/app/utils/datetime';

/**
 * Flagging Manja — Dynamic Compute Helper
 *
 * Rules:
 * - booking_date = today AND hour <= 15:00 WIB → P1
 * - booking_date = today AND hour > 15:00 WIB → P+
 * - booking_date = future → P+
 * - booking_date = yesterday → P1
 * - booking_date older than yesterday → EXPIRED
 */

const MANJA_CUTOFF_HOUR = 15;
const DAY_MS = 86_400_000;

function getBookingContext(bookingDate: string | null) {
  if (!bookingDate) return null;

  const booking = parseWIBDateInput(bookingDate);
  if (!booking || isNaN(booking.getTime())) return null;

  const today = nowWib();
  const bookingDateStr = toWibDateString(booking);
  const todayStr = toWibDateString(today);
  const yesterdayStr = toWibDateString(new Date(today.getTime() - DAY_MS));
  const bookingHourWib = booking.getUTCHours() + 7;

  if (!bookingDateStr || !todayStr || !yesterdayStr) return null;

  return {
    booking,
    bookingDateStr,
    todayStr,
    yesterdayStr,
    bookingHourWib,
  };
}

export function computeFlaggingManja(bookingDate: string | null): string | null {
  const ctx = getBookingContext(bookingDate);
  if (!ctx) return null;

  if (ctx.bookingDateStr === ctx.todayStr && ctx.bookingHourWib <= MANJA_CUTOFF_HOUR) {
    return 'P1';
  }

  if (ctx.bookingDateStr === ctx.todayStr) {
    return 'P+';
  }

  if (ctx.bookingDateStr === ctx.yesterdayStr) {
    return 'P1';
  }

  if (ctx.bookingDateStr > ctx.todayStr) {
    return 'P+';
  }

  return 'EXPIRED';
}

/**
 * Resolve effective flagging at query/render time.
 * Keeps P+ for the current day, promotes to P1 the next day,
 * and marks older tickets as EXPIRED.
 */
export function resolveEffectiveFlagging(
  storedFlagging: string | null,
  bookingDate: string | null,
): string | null {
  const ctx = getBookingContext(bookingDate);
  if (!ctx) return storedFlagging;

  const fallback = computeFlaggingManja(bookingDate);

  if (ctx.bookingDateStr === ctx.todayStr) {
    if (storedFlagging === 'P1') return 'P1';
    if (storedFlagging === 'P+') {
      return ctx.bookingHourWib <= MANJA_CUTOFF_HOUR ? 'P1' : 'P+';
    }
    return fallback ?? storedFlagging;
  }

  if (ctx.bookingDateStr === ctx.yesterdayStr) {
    if (storedFlagging === 'P+' || storedFlagging === 'P1') {
      return 'P1';
    }
    return fallback ?? 'EXPIRED';
  }

  if (ctx.bookingDateStr > ctx.todayStr) {
    return storedFlagging === 'P1' ? 'P1' : (fallback ?? 'P+');
  }

  return fallback ?? 'EXPIRED';
}
