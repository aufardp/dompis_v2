// app/teknisi/components/TeknisiDashboard/utils/ttr.ts

import { Ticket } from '@/app/types/ticket';
import {
  formatDateTimeWIB,
  getSlaHours,
  parseWIBDateInput,
} from '@/app/utils/datetime';
import { addHours } from 'date-fns';

export function getMaxTtrHours(ticket: Ticket): string {
  const customerType = ticket.customerType;
  switch (customerType) {
    case 'REGULER':
      return ticket.maxTtrReguler ?? '-';
    case 'HVC_GOLD':
      return ticket.maxTtrGold ?? '-';
    case 'HVC_PLATINUM':
      return ticket.maxTtrPlatinum ?? '-';
    case 'HVC_DIAMOND':
      return ticket.maxTtrDiamond ?? '-';
    default:
      return '-';
  }
}

export function getMaxTtrInfo(ticket: Ticket): string {
  const parts: string[] = [];

  if (ticket.maxTtrReguler) parts.push(`Reguler: ${ticket.maxTtrReguler}`);
  if (ticket.maxTtrGold) parts.push(`Gold: ${ticket.maxTtrGold}`);
  if (ticket.maxTtrPlatinum) parts.push(`Platinum: ${ticket.maxTtrPlatinum}`);
  if (ticket.maxTtrDiamond) parts.push(`Diamond: ${ticket.maxTtrDiamond}`);

  if (parts.length > 0) return parts.join(' | ');

  const reported = parseWIBDateInput(ticket.reportedDate);
  if (reported) {
    const slaHours = getSlaHours(ticket.customerType);
    const maxTtrDate = addHours(reported, slaHours);
    return formatDateTimeWIB(maxTtrDate.toISOString());
  }

  return '-';
}
