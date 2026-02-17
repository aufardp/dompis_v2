import { BadgeColor } from '../ui/badge/Badge';

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const STATUS_COLOR_MAP: Record<string, BadgeColor> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  CLOSE: 'success',
};

export const getStatusColor = (status: string): BadgeColor => {
  return STATUS_COLOR_MAP[status?.trim()] ?? 'error';
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
