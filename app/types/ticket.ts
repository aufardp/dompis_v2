export type TicketVisitStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

export type TicketCtype =
  | 'REGULER'
  | 'HVC_GOLD'
  | 'HVC_PLATINUM'
  | 'HVC_DIAMOND';

export const CustomerType = {
  REGULER: {
    label: 'Reguler',
    icon: '👤',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
  },
  HVC_GOLD: {
    label: 'HVC Gold',
    icon: '🥇',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  HVC_PLATINUM: {
    label: 'HVC Platinum',
    icon: '💎',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  HVC_DIAMOND: {
    label: 'HVC Diamond',
    icon: '💠',
    color: 'text-sky-600',
    bg: 'bg-sky-50',
  },
} as const satisfies Record<
  TicketCtype,
  { label: string; icon: string; color: string; bg: string }
>;

export interface Ticket {
  idTicket: number;
  ticket: string;
  summary: string;
  reportedDate: string;

  ownerGroup?: string;
  serviceType?: string;
  customerType?: string;
  ctype?: TicketCtype;
  customerSegment?: string;

  serviceNo: string;
  contactName: string;
  contactPhone: string;

  deviceName?: string;
  symptom?: string;
  workzone?: string;
  alamat?: string | null;

  status: string;
  hasilVisit?: TicketVisitStatus;

  bookingDate?: string;
  sourceTicket?: string;
  jenisTiket?: string;

  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;

  pendingReason?: string | null;

  rca?: string | null;
  subRca?: string | null;

  teknisiUserId?: number | null;
  technicianName?: string | null;

  closedAt?: string | null;
}
