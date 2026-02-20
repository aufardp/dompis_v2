import { BadgeColor } from '../ui/badge/Badge';
import { formatDateWIB } from '@/app/utils/datetime';

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

export const getStatusColor = (status: string): BadgeColor => {
  const key = String(status || '')
    .trim()
    .toUpperCase();
  return STATUS_COLOR_MAP[key] ?? 'error';
};

export function getMaxTtr(ticket: any): string | null {
  if (!ticket?.customerType) return null;

  const map: Record<string, keyof typeof ticket> = {
    reguler: 'maxTtrReguler',
    hvc_gold: 'maxTtrGold',
    hvc_platinum: 'maxTtrPlatinum',
    hvc_diamond: 'maxTtrDiamond',
  };

  const key = map[ticket.customerType.toLowerCase()];
  return key ? ticket[key] : null;
}
