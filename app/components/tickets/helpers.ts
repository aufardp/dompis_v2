import { BadgeColor } from '../ui/badge/Badge';
import {
  formatDateWIB,
  calculateTicketAge as calcAge,
  getTicketAgeColor as getAgeColor,
  getSlaHours,
  TicketAgeColor,
} from '@/app/utils/datetime';
import { getEffectiveMaxTtrLabel } from '@/app/libs/tickets/effective';

export const formatDate = (dateStr: string) => {
  return formatDateWIB(dateStr, 'dd MMM yyyy');
};

const STATUS_COLOR_MAP: Record<string, BadgeColor> = {
  OPEN: 'warning',
  ASSIGNED: 'info',
  ON_PROGRESS: 'info',
  IN_PROGRESS: 'info',
  CLOSE: 'success',
  CLOSED: 'success',
  CANCELLED: 'error',
  PENDING: 'warning',
  ESCALATED: 'dark',
};

const STATUS_LABEL_MAP: Record<string, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  ON_PROGRESS: 'On Progress',
  IN_PROGRESS: 'On Progress',
  CLOSE: 'Closed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  ESCALATED: 'Escalated',
};

export const getStatusColor = (status: string): BadgeColor => {
  const key = String(status || '')
    .trim()
    .toUpperCase();
  return STATUS_COLOR_MAP[key] ?? 'error';
};

export const getStatusLabel = (status: string): string => {
  const key = String(status || '')
    .trim()
    .toUpperCase();
  return STATUS_LABEL_MAP[key] ?? status ?? '-';
};

export function getMaxTtr(ticket: any): string | null {
  return getEffectiveMaxTtrLabel(ticket);
}

export function getSlaHoursRemaining(ticket: {
  reportedDate?: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
  customerType?: string;
}): number {
  if (!ticket.reportedDate) return 0;

  const slaHours = getSlaHours(ticket.customerType);

  try {
    const start = new Date(ticket.reportedDate);
    const now = new Date();

    if (ticket.hasilVisit === 'CLOSE' && ticket.closedAt) {
      const closed = new Date(ticket.closedAt);
      const hoursElapsed =
        (closed.getTime() - start.getTime()) / (1000 * 60 * 60);
      return Math.max(0, slaHours - hoursElapsed);
    }

    const hoursElapsed = (now.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(0, slaHours - hoursElapsed);
  } catch {
    return 0;
  }
}

export function isTicketExpired(ticket: {
  reportedDate?: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
  customerType?: string;
}): boolean {
  return getSlaHoursRemaining(ticket) <= 0;
}

export function getTicketAge(ticket: {
  reportedDate?: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
}): string {
  return calcAge(ticket.reportedDate, ticket.hasilVisit, ticket.closedAt);
}

const AGE_COLOR_CLASS_MAP: Record<TicketAgeColor, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
};

export function getTicketAgeColorClass(ticket: {
  reportedDate?: string | null;
  hasilVisit?: string | null;
  closedAt?: string | null;
  customerType?: string;
}): string {
  const color = getAgeColor(
    ticket.reportedDate,
    ticket.hasilVisit,
    ticket.closedAt,
    ticket.customerType,
  );
  return AGE_COLOR_CLASS_MAP[color];
}
