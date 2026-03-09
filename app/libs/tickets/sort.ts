import { differenceInHours, differenceInMinutes } from 'date-fns';
import {
  getEffectiveFlaggingLabel,
  getEffectiveTtrMs,
} from '@/app/libs/tickets/effective';
import { isDifferentWIBDay, parseWIBDateInput } from '@/app/utils/datetime';

export type TicketSeverity = 'critical' | 'warning' | 'normal';

function parseDateInput(dateStr: string | null | undefined): Date | null {
  return parseWIBDateInput(dateStr);
}

export function calculateAgeInHours(
  reportedDate: string | null | undefined,
  hasilVisit?: string | null,
  closedAt?: string | null,
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

  if (hours >= 24) return 'critical';
  if (hours >= 8) return 'warning';
  return 'normal';
}

export const SEVERITY_COLORS = {
  critical: {
    border: 'border-l-red-500',
    badge: 'bg-red-100 text-red-700',
  },
  warning: {
    border: 'border-l-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
  normal: {
    border: 'border-l-green-500',
    badge: 'bg-green-100 text-green-700',
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

export const SEGMENT_PRIORITY: Record<string, number> = {
  hvc_diamond: 4,
  diamond: 4,
  hvc_platinum: 3,
  platinum: 3,
  hvc_gold: 2,
  gold: 2,
  reguler: 1,
  regular: 1,
};

// B2C Customer Type Priority (for prioritized sorting)
export const B2C_CUSTOMER_PRIORITY: Record<string, number> = {
  HVC_DIAMOND: 4, // Priority #1 - Highest
  HVC_PLATINUM: 3, // Priority #2
  HVC_GOLD: 2, // Priority #3
  REGULER: 1, // Priority #4 - Lowest
};

export const TICKET_TYPE_PRIORITY: Record<string, number> = {
  regular: 2,
  reguler: 2,
  sqm: 1,
  unspec: 0,
};

export const STATUS_PRIORITY: Record<string, number> = {
  open: 3,
  assigned: 2,
  on_progress: 2,
  in_progress: 2,
  pending: 1,
  cancelled: 0,
  close: -1,
  closed: -1,
};

export function getSegmentPriority(
  customerType: string | null | undefined,
): number {
  if (!customerType) return 0;
  const normalized = customerType.toLowerCase().replace('hvc_', '');
  return SEGMENT_PRIORITY[normalized] ?? 0;
}

export function getTicketTypePriority(
  jenisTiket: string | null | undefined,
): number {
  if (!jenisTiket) return 0;
  const normalized = jenisTiket.toLowerCase();
  return TICKET_TYPE_PRIORITY[normalized] ?? 0;
}

export function getStatusPriority(
  hasilVisit: string | null | undefined,
): number {
  if (!hasilVisit) return 2;
  const normalized = hasilVisit.toLowerCase().replace(/\s+/g, '_');
  return STATUS_PRIORITY[normalized] ?? 2;
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
      // 1. Customer Type Priority (HVC_DIAMOND > HVC_PLATINUM > HVC_GOLD > REGULER)
      // Normalize customer type to handle different formats
      const customerTypeA = normalizeCustomerType(a.customerType || a.ctype);
      const customerTypeB = normalizeCustomerType(b.customerType || b.ctype);

      const priorityA = B2C_CUSTOMER_PRIORITY[customerTypeA] || 0;
      const priorityB = B2C_CUSTOMER_PRIORITY[customerTypeB] || 0;

      if (priorityB !== priorityA) {
        return priorityB - priorityA; // Higher priority first
      }

      // 2. Ticket Age (older tickets first)
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

      return ageB - ageA; // Older tickets first
    });
  } catch (error) {
    console.error('sortByB2CPriority error:', error);
    return tickets;
  }
}

function normalizeCustomerType(
  customerType: string | null | undefined,
): string {
  if (!customerType) return '';
  const normalized = customerType.trim().toUpperCase();
  // Handle common variations
  if (normalized.includes('DIAMOND')) return 'HVC_DIAMOND';
  if (normalized.includes('PLATINUM')) return 'HVC_PLATINUM';
  if (normalized.includes('GOLD')) return 'HVC_GOLD';
  if (normalized.includes('REGULER') || normalized.includes('REGULAR'))
    return 'REGULER';
  return normalized;
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
