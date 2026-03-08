// libs/ticket-summary.ts

import { isTicketClosed } from '@/app/libs/ticket-utils';

export interface DailyTicket {
  idTicket: number;
  ticket: string;
  CUSTOMER_TYPE: string | null;
  JENIS_TIKET: string | null;
  STATUS_UPDATE: string | null;
  HASIL_VISIT: string | null;
  teknisi_user_id: number | null;
  PENDING_REASON: string | null;
  FLAGGING_MANJA: string | null;
  GUARANTE_STATUS: string | null;
  closed_at: string | null;
  WORKZONE: string | null;
  [key: string]: any;
}

export interface TicketCounts {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  closed: number;
}

export interface CustomerTypeSummary {
  type: string;
  total: number;
  reguler: number;
  sqm: number;
  hvc: number;
  unspec: number;
  ffg: number;
  p1: number;
  pPlus: number;
  open: number;
  assigned: number;
  closed: number;
}

export interface TicketSummary {
  counts: TicketCounts;
  byCustomerType: CustomerTypeSummary[];
  scope: 'daily'; // always 'daily' — enforced to clarify scope
}

/**
 * Computes all summary statistics from a flat array of daily tickets.
 * This ensures summary and table are ALWAYS computed from the same dataset.
 *
 * @param tickets - Array of daily tickets from /api/tickets/daily
 * @returns TicketSummary with counts and breakdowns
 */
export function computeTicketSummary(tickets: DailyTicket[]): TicketSummary {
  const counts: TicketCounts = {
    total: tickets.length,
    open: 0,
    assigned: 0,
    onProgress: 0,
    pending: 0,
    closed: 0,
  };

  for (const t of tickets) {
    const closed = isTicketClosed(t.STATUS_UPDATE);
    const isAssigned = t.teknisi_user_id !== null;
    const isPending = !!(t.PENDING_REASON && t.PENDING_REASON.trim() !== '');

    if (closed) {
      counts.closed++;
    } else if (isPending) {
      counts.pending++;
      counts.assigned++; // Pending tickets are also assigned
    } else if (isAssigned) {
      counts.assigned++;
      counts.onProgress++;
    } else {
      counts.open++;
    }
  }

  // Group by customer type
  const typeMap = new Map<string, DailyTicket[]>();
  for (const t of tickets) {
    const type = t.CUSTOMER_TYPE ?? 'Unspec';
    if (!typeMap.has(type)) typeMap.set(type, []);
    typeMap.get(type)!.push(t);
  }

  const byCustomerType: CustomerTypeSummary[] = Array.from(typeMap.entries()).map(
    ([type, group]) => {
      const closedCount = group.filter((t) => isTicketClosed(t.STATUS_UPDATE)).length;
      const nonClosedGroup = group.filter((t) => !isTicketClosed(t.STATUS_UPDATE));
      const assignedCount = nonClosedGroup.filter((t) => t.teknisi_user_id !== null).length;
      const openCount = nonClosedGroup.filter((t) => t.teknisi_user_id === null).length;

      return {
        type,
        total: group.length,
        reguler: group.filter((t) => t.JENIS_TIKET === 'reguler' || t.JENIS_TIKET === 'REGULER').length,
        sqm: group.filter((t) => t.JENIS_TIKET === 'sqm' || t.JENIS_TIKET === 'SQM').length,
        hvc: group.filter(
          (t) =>
            t.JENIS_TIKET === 'hvc' ||
            t.JENIS_TIKET === 'HVC' ||
            type.includes('HVC'),
        ).length,
        unspec: group.filter((t) => !t.JENIS_TIKET || t.JENIS_TIKET === 'unspec' || t.JENIS_TIKET === 'Unspec').length,
        ffg: group.filter((t) => t.GUARANTE_STATUS?.toLowerCase() === 'guarantee').length,
        p1: group.filter((t) => t.FLAGGING_MANJA === 'P1').length,
        pPlus: group.filter((t) => t.FLAGGING_MANJA === 'P+').length,
        open: openCount,
        assigned: assignedCount,
        closed: closedCount,
      };
    },
  );

  return {
    counts,
    byCustomerType,
    scope: 'daily',
  };
}

/**
 * Filters tickets based on active customer type and status filters.
 * Returns the filtered array for table display.
 */
export function filterTickets(
  tickets: DailyTicket[],
  activeCustomerType: string | null,
  activeStatus: string | null,
): DailyTicket[] {
  let result = tickets;

  if (activeCustomerType) {
    result = result.filter((t) => t.CUSTOMER_TYPE === activeCustomerType);
  }

  if (activeStatus) {
    result = result.filter((t) => {
      const closed = isTicketClosed(t.STATUS_UPDATE);
      const isAssigned = t.teknisi_user_id !== null;
      const isPending = !!(t.PENDING_REASON && t.PENDING_REASON.trim() !== '');

      switch (activeStatus) {
        case 'open':
          return !closed && !isAssigned && !isPending;
        case 'assigned':
          return !closed && isAssigned;
        case 'on_progress':
          return !closed && isAssigned;
        case 'pending':
          return !closed && isPending;
        case 'closed':
          return closed;
        default:
          return true;
      }
    });
  }

  return result;
}
