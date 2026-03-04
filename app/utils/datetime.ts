import {
  format,
  formatInTimeZone,
  toDate,
  toZonedTime,
  fromZonedTime,
} from 'date-fns-tz';
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
} from 'date-fns';
import { id } from 'date-fns/locale';

export const WIB_TIMEZONE = 'Asia/Jakarta';

/**
 * Parses a date string that may come from Sheets or API, normalizing it to a
 * real instant in time. Strings without an explicit timezone are interpreted
 * as WIB (Asia/Jakarta).
 */
export function parseWIBDateInput(
  dateStr: string | null | undefined,
): Date | null {
  if (!dateStr) return null;

  const raw = String(dateStr).trim();
  if (!raw) return null;

  try {
    // Handle DD/MM/YYYY HH:mm format (assumed WIB)
    if (raw.includes('/')) {
      const [day, month, yearAndTime] = raw.split('/');
      const [year, time] = (yearAndTime || '').split(' ');
      const [hour, minute] = time ? time.split(':') : ['0', '0'];

      const dd = String(day || '').padStart(2, '0');
      const mm = String(month || '').padStart(2, '0');
      const yyyy = String(year || '').padStart(4, '0');
      const hh = String(hour || '0').padStart(2, '0');
      const mi = String(minute || '0').padStart(2, '0');

      const asWib = `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
      const d = fromZonedTime(asWib, WIB_TIMEZONE);
      return isNaN(d.getTime()) ? null : d;
    }

    // Explicit timezone in string -> parse as-is
    if (
      /[zZ]$/.test(raw) ||
      /[+-]\d\d:?\d\d$/.test(raw) ||
      /[+-]\d\d:?\d\d\s*$/.test(raw)
    ) {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }

    // No timezone -> interpret as WIB
    const wib = fromZonedTime(raw, WIB_TIMEZONE);
    if (!isNaN(wib.getTime())) return wib;

    // Last resort
    const standard = new Date(raw);
    return isNaN(standard.getTime()) ? null : standard;
  } catch {
    return null;
  }
}

function parseDateInput(dateStr: string | null | undefined): Date | null {
  return parseWIBDateInput(dateStr);
}

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
    let parsed: Date | null = null;
    if (typeof date === 'string') parsed = parseDateInput(date);
    else if (date instanceof Date) parsed = date;

    if (!parsed) return '-';

    return formatInTimeZone(parsed, WIB_TIMEZONE, formatStr, { locale: id });
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

export function calculateTicketAge(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
): string {
  if (!reportedDate) return '-';

  try {
    const start = parseDateInput(reportedDate);
    if (!start) return '-';

    let end: Date;
    if (hasilVisit === 'CLOSE' && closedAt) {
      end = new Date(closedAt);
      if (isNaN(end.getTime())) {
        end = new Date();
      }
    } else {
      end = new Date();
    }

    const totalMinutes = differenceInMinutes(end, start);
    if (totalMinutes < 0) return '0m';

    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);

    return parts.join(' ');
  } catch {
    return '-';
  }
}

export type TicketAgeColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export const SLA_HOURS: Record<string, number> = {
  REGULER: 24,
  HVC_GOLD: 12,
  HVC_PLATINUM: 6,
  HVC_DIAMOND: 3,
};

export function getSlaHours(customerType?: string): number {
  if (!customerType) return 24;
  return SLA_HOURS[customerType.toUpperCase()] ?? 24;
}

export function getTicketAgeColor(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
  customerType?: string,
): TicketAgeColor {
  if (!reportedDate) return 'gray';

  try {
    const start = parseDateInput(reportedDate);
    if (!start) return 'gray';

    let end: Date;
    if (hasilVisit === 'CLOSE' && closedAt) {
      end = new Date(closedAt);
      if (isNaN(end.getTime())) {
        end = new Date();
      }
    } else {
      end = new Date();
    }

    const totalHours = differenceInHours(end, start);
    if (totalHours < 0) return 'gray';

    const slaHours = getSlaHours(customerType);
    const percentage = (totalHours / slaHours) * 100;

    if (percentage < 50) return 'green';
    if (percentage < 75) return 'yellow';
    if (percentage < 100) return 'orange';
    return 'red';
  } catch {
    return 'gray';
  }
}

export function getWIBDayKey(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? parseWIBDateInput(date) : date;
  if (!d || isNaN(d.getTime())) return null;
  try {
    return formatInTimeZone(d, WIB_TIMEZONE, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

export function isDifferentWIBDay(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  const ka = getWIBDayKey(a);
  const kb = getWIBDayKey(b);
  if (!ka || !kb) return false;
  return ka !== kb;
}
