import { differenceInHours, differenceInMinutes } from 'date-fns';
import {
  getEffectiveFlaggingLabel,
  getEffectiveTtrMs,
} from '@/app/libs/tickets/effective';
import { isDifferentWIBDay, parseWIBDateInput } from '@/app/utils/datetime';
import {
  getCustomerPriority,
  getCustomerTypeConfig,
  normalizeCustomerType,
  getSlaHours,
} from '@/app/config/customer-types';
import {
  normalizeJenis,
  B2C_JENIS_KEYS,
  B2B_JENIS_KEYS,
  JENIS_TIKET_LIST,
} from '@/app/config/jenis-tiket';
import {
  FLAG_PRIORITY,
  STATUS_PRIORITY_CONFIG,
  AGE_SEVERITY_HOURS,
} from '@/app/config/priority-rules';

export { getCustomerPriority } from '@/app/config/customer-types';
export { normalizeCustomerType } from '@/app/config/customer-types';
export { normalizeJenis, B2C_JENIS_KEYS, B2B_JENIS_KEYS } from '@/app/config/jenis-tiket';
export {
  FLAG_PRIORITY,
  STATUS_PRIORITY_CONFIG,
  AGE_SEVERITY_HOURS,
} from '@/app/config/priority-rules';

export type TicketSeverity = 'critical' | 'warning' | 'normal';

function parseDateInput(
  dateStr: string | Date | null | undefined,
): Date | null {
  return parseWIBDateInput(dateStr);
}

export function calculateAgeInHours(
  reportedDate: string | Date | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | Date | null,
): number {
  if (!reportedDate) return 0;

  const start = parseDateInput(reportedDate);
  if (!start) return 0;

  let end: Date;
  if (hasilVisit === 'CLOSE' && closedAt) {
    end = new Date(closedAt);
    if (isNaN(end.getTime())) {
      end = new Date();
    }
  } else {
    end = new Date();
  }

  return differenceInHours(end, start);
}

export function getTicketSeverity(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
): TicketSeverity {
  const hours = calculateAgeInHours(reportedDate, hasilVisit, closedAt);

  if (hours >= AGE_SEVERITY_HOURS.CRITICAL) return 'critical';
  if (hours >= AGE_SEVERITY_HOURS.WARNING) return 'warning';
  return 'normal';
}

export const SEVERITY_COLORS = {
  critical: {
    border: 'border-l-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  },
  warning: {
    border: 'border-l-amber-500',
    badge:
      'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  },
  normal: {
    border: 'border-l-green-500',
    badge:
      'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  },
} as const;

export function formatAge(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
): string {
  if (!reportedDate) return '-';

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
}

export interface TicketWithRank {
  rank: number;
  severity: TicketSeverity;
  ageFormatted: string;
}

export interface TicketBase {
  idTicket?: number;
  reportedDate?: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
  customerType?: string | null;
  ctype?: string;
  bookingDate?: string | null;
  jenisTiket?: string | null;
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
}

const TICKET_TYPE_PRIORITY = new Map(
  JENIS_TIKET_LIST.map((j) => [j.key.toLowerCase(), j.priority])
);

export function getSegmentPriority(
  customerType: string | null | undefined,
): number {
  return getCustomerPriority(customerType);
}

export function getTicketTypePriority(
  jenisTiket: string | null | undefined,
): number {
  if (!jenisTiket) return 0;
  const normalized = jenisTiket.toLowerCase();
  return TICKET_TYPE_PRIORITY.get(normalized) ?? 0;
}

export function getStatusPriority(
  hasilVisit: string | null | undefined,
): number {
  if (!hasilVisit) return 2;
  const normalized = hasilVisit.toLowerCase().replace(/\s+/g, '_');
  return STATUS_PRIORITY_CONFIG[normalized] ?? 2;
}

export function isDifferentDay(dateStr: string | null | undefined): boolean {
  return isDifferentWIBDay(dateStr, new Date());
}

export function getFlaggingManjaPriority(ticket: TicketBase): number {
  const label = getEffectiveFlaggingLabel(ticket);
  if (label === 'P1') return 3;
  if (label === 'P+') return 2;
  return 1;
}

export function sortByPriority<T extends TicketBase>(tickets: T[]): T[] {
  try {
    return [...tickets].sort((a, b) => {
      // 1) Flagging bucket (P1 > P+ > normal). P+ escalates to P1 on next WIB day when OPEN/PENDING.
      const bucketA = getFlaggingManjaPriority(a);
      const bucketB = getFlaggingManjaPriority(b);
      if (bucketA !== bucketB) return bucketB - bucketA;

      // 2) Effective Max TTR (earlier deadline first)
      const ttrA = getEffectiveTtrMs(a);
      const ttrB = getEffectiveTtrMs(b);
      if (ttrA != null && ttrB != null && ttrA !== ttrB) return ttrA - ttrB;
      if (ttrA != null && ttrB == null) return -1;
      if (ttrA == null && ttrB != null) return 1;

      // 3) Secondary: status, segment, age, ticket type
      const statusA = getStatusPriority(a.hasilVisit);
      const statusB = getStatusPriority(b.hasilVisit);
      if (statusA !== statusB) return statusB - statusA;

      const segmentA = getSegmentPriority(a.ctype || a.customerType);
      const segmentB = getSegmentPriority(b.ctype || b.customerType);
      if (segmentA !== segmentB) return segmentB - segmentA;

      const ageA = calculateAgeInHours(
        a.reportedDate,
        a.hasilVisit,
        a.closedAt,
      );
      const ageB = calculateAgeInHours(
        b.reportedDate,
        b.hasilVisit,
        b.closedAt,
      );
      if (ageA !== ageB) return ageB - ageA;

      const typeA = getTicketTypePriority(a.jenisTiket);
      const typeB = getTicketTypePriority(b.jenisTiket);
      if (typeA !== typeB) return typeB - typeA;

      return 0;
    });
  } catch (error) {
    console.error('sortByPriority error:', error);
    return tickets;
  }
}

export function sortByB2CPriority<T extends TicketBase>(tickets: T[]): T[] {
  try {
    return [...tickets].sort((a, b) => {
      const priorityA = getCustomerPriority(a.customerType || a.ctype);
      const priorityB = getCustomerPriority(b.customerType || b.ctype);

      if (priorityB !== priorityA) {
        return priorityB - priorityA;
      }

      const ageA = calculateAgeInHours(
        a.reportedDate,
        a.hasilVisit,
        a.closedAt,
      );
      const ageB = calculateAgeInHours(
        b.reportedDate,
        b.hasilVisit,
        b.closedAt,
      );

      return ageB - ageA;
    });
  } catch (error) {
    console.error('sortByB2CPriority error:', error);
    return tickets;
  }
}

export function computeTicketRanks<T extends TicketBase>(
  tickets: T[],
): Map<number, TicketWithRank> {
  const ticketMap = new Map<number, TicketWithRank>();

  const sortedByAge = [...tickets].sort((a, b) => {
    const hoursA = calculateAgeInHours(
      a.reportedDate,
      a.hasilVisit,
      a.closedAt,
    );
    const hoursB = calculateAgeInHours(
      b.reportedDate,
      b.hasilVisit,
      b.closedAt,
    );
    return hoursB - hoursA;
  });

  sortedByAge.forEach((ticket, index) => {
    const id = ticket.idTicket;
    if (id !== undefined) {
      ticketMap.set(id, {
        rank: index + 1,
        severity: getTicketSeverity(
          ticket.reportedDate,
          ticket.hasilVisit,
          ticket.closedAt,
        ),
        ageFormatted: formatAge(
          ticket.reportedDate,
          ticket.hasilVisit,
          ticket.closedAt,
        ),
      });
    }
  });

  return ticketMap;
}
