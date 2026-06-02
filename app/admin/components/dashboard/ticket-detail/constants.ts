import type { TicketCtype } from '@/app/types/ticket';
import type { TicketStatusKey } from './types';

export const CTYPE_BORDER: Record<TicketCtype, string> = {
  REGULER: 'border-slate-200',
  HVC_GOLD: 'border-amber-200',
  HVC_PLATINUM: 'border-indigo-200',
  HVC_DIAMOND: 'border-sky-200',
};

export const STATUS_CONFIG: Record<
  TicketStatusKey | string,
  {
    label: string;
    color: string;
    bg: string;
    dot: string;
    icon?: string;
    border?: string;
  }
> = {
  OPEN: {
    label: 'Open',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
    border: 'border-blue-200',
  },
  ASSIGNED: {
    label: 'Assigned',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    dot: 'bg-indigo-500',
    border: 'border-indigo-200',
  },
  ON_PROGRESS: {
    label: 'On Progress',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    dot: 'bg-purple-500',
    border: 'border-purple-200',
  },
  IN_PROGRESS: {
    label: 'On Progress',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    dot: 'bg-purple-500',
    border: 'border-purple-200',
  },
  PENDING: {
    label: 'Pending',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    dot: 'bg-orange-500',
    border: 'border-orange-200',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    dot: 'bg-slate-400',
    border: 'border-slate-200',
  },
  CLOSE: {
    label: 'Closed',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200',
  },
};

export const TAB_LIST = [
  { key: 'umum', label: 'Umum' },
  { key: 'customer', label: 'Customer' },
  { key: 'teknis', label: 'Teknis' },
  { key: 'sla', label: 'SLA' },
  { key: 'tracking', label: 'Tracking' },
] as const;
