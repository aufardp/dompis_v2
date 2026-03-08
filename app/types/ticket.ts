import { StatusUpdateValue } from '@/app/libs/ticket-utils';

export type TicketVisitStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

export type TicketType =
  | 'reguler'
  | 'sqm'
  | 'hvc'
  | 'unspec'
  | 'sqm-ccan'
  | 'indibiz'
  | 'datin'
  | 'reseller'
  | 'wifi-id';

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
  STATUS_UPDATE?: StatusUpdateValue | null;
  hasilVisit?: TicketVisitStatus;

  bookingDate?: string;
  sourceTicket?: string;
  jenisTiket?: string;

  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;

  flaggingManja?: string | null;
  guaranteeStatus?: string | null;

  pendingReason?: string | null;

  rca?: string | null;
  subRca?: string | null;

  teknisiUserId?: number | null;
  technicianName?: string | null;

  closedAt?: string | null;

  // Sync metadata fields
  syncDate?: string | null;
  syncedAt?: string | null;
  importBatch?: string | null;
}

export type LockedTicket = {
  id_ticket: number;
  INCIDENT: string;
  WORKZONE: string | null;
  teknisi_user_id: number | null;
  STATUS_UPDATE: string | null;
  PENDING_REASON: string | null;
  ALAMAT: string | null;
  SERVICE_NO: string | null;
  CONTACT_NAME: string | null;
};

export type ActorContext = {
  id_user: number;
  role: string;
};

export type TicketUpdatePatch = {
  summary?: string | null;
  ownerGroup?: string | null;
  status?: string | null;
  workzone?: string | null;
  serviceType?: string | null;
  customerSegment?: string | null;
  customerType?: string | null;
  serviceNo?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  deviceName?: string | null;
  symptom?: string | null;
  alamat?: string | null;
  descriptionActualSolution?: string | null;
  pendingReason?: string | null;
};

export type TicketUpdateWorkflow = {
  status?: string;
  pendingReason?: string | null;
  note?: string | null;
};

export type UpdateTicketInput = {
  patch?: TicketUpdatePatch;
  workflow?: TicketUpdateWorkflow;
};
