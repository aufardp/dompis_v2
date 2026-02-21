import { differenceInHours, differenceInMinutes } from 'date-fns';

export type TicketSeverity = 'critical' | 'warning' | 'normal';

function parseDateInput(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  try {
    if (dateStr.includes('/')) {
      const [day, month, yearAndTime] = dateStr.split('/');
      const [year, time] = yearAndTime.split(' ');
      const [hour, minute] = time ? time.split(':') : ['0', '0'];
      const parsed = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
      );
      if (!isNaN(parsed.getTime())) return parsed;
    }

    const standard = new Date(dateStr);
    if (!isNaN(standard.getTime())) return standard;

    return null;
  } catch {
    return null;
  }
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
