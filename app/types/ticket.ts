import { StatusUpdateValue } from '@/app/libs/ticket-utils';
import {
  CUSTOMER_TYPES,
  CustomerTypeConfig,
  CustomerTypeKey,
} from '@/app/config/customer-types';

export type TicketVisitStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

export type TicketType =
  | 'reg'
  | 'sqm'
  | 'hvc'
  | 'unspec'
  | 'sqm-ccan'
  | 'indibiz'
  | 'datin'
  | 'reseller'
  | 'wifi-id';

export type TicketCtype = CustomerTypeKey;

export const CustomerType: Record<string, CustomerTypeConfig> = Object.fromEntries(
  CUSTOMER_TYPES.map((ct) => [ct.key, ct])
);

export type { CustomerTypeConfig };
export { CUSTOMER_TYPES };

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

  ticketIdGamas?: string | null;

  deviceName?: string;
  symptom?: string;
  workzone?: string;
  alamat?: string | null;

  status: string;
  status_update?: StatusUpdateValue | null;
  hasilVisit?: TicketVisitStatus;

  bookingDate?: string;
  sourceTicket?: string;
  jenisTiket?: string;
  jenisTiket1?: string | null;

  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;

  flaggingManja?: string | null;
  guaranteeStatus?: string | null;

  pendingDompis?: string | null;

  rca?: string | null;
  subRca?: string | null;
  descriptionSolutionDompis?: string | null;

  teknisiUserId?: number | null;
  technicianName?: string | null;

  closedAt?: string | null;

  worklogSummary?: string | null;

  // Sync metadata fields
  syncDate?: string | null;
  syncedAt?: string | null;
  importBatch?: string | null;
}

export type LockedTicket = {
  id_ticket: number;
  incident: string;
  workzone: string | null;
  teknisi_user_id: number | null;
  status_update: string | null;
  pending_dompis: string | null;
  alamat: string | null;
  service_no: string | null;
  contact_name: string | null;
  owner_group: string | null;
  customer_type: string | null;
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
  descriptionSolutionDompis?: string | null;
  pendingDompis?: string | null;
};

export type TicketUpdateWorkflow = {
  status?: string;
  pendingDompis?: string | null;
  note?: string | null;
};

export type UpdateTicketInput = {
  patch?: TicketUpdatePatch;
  workflow?: TicketUpdateWorkflow;
};
