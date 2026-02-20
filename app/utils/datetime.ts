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

export function calculateTicketAge(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
): string {
  if (!reportedDate) return '-';

  try {
    const start = toDate(reportedDate);
    if (isNaN(start.getTime())) return '-';

    let end: Date;
    if (hasilVisit === 'CLOSE' && closedAt) {
      end = toDate(closedAt);
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

export function getTicketAgeColor(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
): TicketAgeColor {
  if (!reportedDate) return 'gray';

  try {
    const start = toDate(reportedDate);
    if (isNaN(start.getTime())) return 'gray';

    let end: Date;
    if (hasilVisit === 'CLOSE' && closedAt) {
      end = toDate(closedAt);
      if (isNaN(end.getTime())) {
        end = new Date();
      }
    } else {
      end = new Date();
    }

    const totalHours = differenceInHours(end, start);
    if (totalHours < 0) return 'gray';

    if (totalHours < 6) return 'green';
    if (totalHours < 12) return 'yellow';
    if (totalHours < 24) return 'orange';
    return 'red';
  } catch {
    return 'gray';
  }
}
