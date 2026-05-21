import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

const TIMEZONE = 'Asia/Jakarta';

export function toWibString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return format(toZonedTime(d, TIMEZONE), 'yyyy-MM-dd HH:mm:ss', { timeZone: TIMEZONE });
}

export function toWibDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return format(toZonedTime(d, TIMEZONE), 'yyyy-MM-dd', { timeZone: TIMEZONE });
}

/**
 * Returns current time as a Date object representing WIB.
 * MySQL DateTime(0) stores this value as-is (no TZ conversion).
 * Use this for sync_date, synced_at, importedAt, lastSeenAt, etc.
 */
export function nowWib(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

/**
 * Returns today's date at midnight WIB as a Date object.
 * Use this for filtering sync_date = today in WIB.
 */
export function todayWibDate(): Date {
  const wibNow = toZonedTime(new Date(), TIMEZONE);
  const wibStart = startOfDay(wibNow);
  return fromZonedTime(wibStart, TIMEZONE);
}

/**
 * Returns a Date object representing today's date in WIB,
 * but with UTC time set to midnight of that date.
 * Use this for @db.Date columns (MySQL DATE type) which store
 * the UTC date portion. This ensures the stored date matches WIB date.
 */
export function todayWibDateForDb(): Date {
  const wibStr = format(toZonedTime(new Date(), TIMEZONE), 'yyyy-MM-dd', { timeZone: TIMEZONE });
  return new Date(`${wibStr}T00:00:00.000Z`);
}

export function getTodayWibRange(): { start: Date; end: Date } {
  const wibNow = toZonedTime(new Date(), TIMEZONE);
  const wibStart = startOfDay(wibNow);
  const wibEnd = endOfDay(wibNow);
  return {
    start: fromZonedTime(wibStart, TIMEZONE),
    end: fromZonedTime(wibEnd, TIMEZONE),
  };
}

export function parseWibDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}