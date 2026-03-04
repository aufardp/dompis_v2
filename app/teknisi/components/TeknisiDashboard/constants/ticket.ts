// app/teknisi/components/TeknisiDashboard/constants/ticket.ts

export const STATUS = {
  ASSIGNED: 'ASSIGNED',
  ON_PROGRESS: 'ON_PROGRESS',
  PENDING: 'PENDING',
  CLOSE: 'CLOSE',
} as const;

export type TicketStatus = (typeof STATUS)[keyof typeof STATUS];

export const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  [STATUS.ASSIGNED]: {
    label: 'Menunggu',
    className: 'bg-amber-100 text-amber-700',
  },
  [STATUS.ON_PROGRESS]: {
    label: 'Dikerjakan',
    className: 'bg-blue-100 text-blue-700',
  },
  [STATUS.PENDING]: {
    label: 'Pending',
    className: 'bg-purple-100 text-purple-700',
  },
  [STATUS.CLOSE]: {
    label: 'Selesai',
    className: 'bg-green-100 text-green-700',
  },
};

export type TicketFilter =
  | 'all'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'closed';

export const FILTER_CONFIG: Record<
  TicketFilter,
  { label: string; status: TicketStatus | null }
> = {
  all: { label: 'Aktif', status: null },
  assigned: { label: 'Menunggu', status: STATUS.ASSIGNED },
  on_progress: { label: 'Dikerjakan', status: STATUS.ON_PROGRESS },
  pending: { label: 'Pending', status: STATUS.PENDING },
  closed: { label: 'Selesai', status: STATUS.CLOSE },
};

export const TICKET_AGE_COLORS = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
} as const;
