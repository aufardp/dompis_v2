import {
  format,
  formatInTimeZone,
  toDate,
  toZonedTime,
  fromZonedTime,
} from 'date-fns-tz';
import { id } from 'date-fns/locale';

export const WIB_TIMEZONE = 'Asia/Jakarta';

export function nowUTC(): Date {
  return new Date();
}

export function toWIB(date: Date | string): Date {
  const d = typeof date === 'string' ? toDate(date) : date;
  return toZonedTime(d, WIB_TIMEZONE);
}

export function toUTC(date: Date | string): Date {
  const d = typeof date === 'string' ? toDate(date) : date;
  return fromZonedTime(d, WIB_TIMEZONE);
}

export function formatDateWIB(
  date: Date | string | null | undefined,
  formatStr: string = 'dd MMM yyyy',
): string {
  if (!date) return '-';

  try {
    const d = typeof date === 'string' ? toDate(date) : date;
    if (isNaN(d.getTime())) return '-';

    return formatInTimeZone(d, WIB_TIMEZONE, formatStr, { locale: id });
  } catch {
    return '-';
  }
}

export function formatDateTimeWIB(
  date: Date | string | null | undefined,
): string {
  return formatDateWIB(date, 'dd MMM yyyy, HH:mm');
}

export function formatTimeWIB(date: Date | string | null | undefined): string {
  return formatDateWIB(date, 'HH:mm');
}

export function formatDateTimeFullWIB(
  date: Date | string | null | undefined,
): string {
  return formatDateWIB(date, 'dd MMMM yyyy, HH:mm') + ' WIB';
}

export function toISODateString(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null;

  try {
    const d = typeof date === 'string' ? toDate(date) : date;
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export function parseWIBDateString(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    return fromZonedTime(dateStr, WIB_TIMEZONE);
  } catch {
    return null;
  }
}
