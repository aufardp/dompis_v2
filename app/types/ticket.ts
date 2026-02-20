export type TicketVisitStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

export interface Ticket {
  idTicket: number;
  ticket: string;
  summary: string;
  reportedDate: string;

  ownerGroup?: string;
  serviceType?: string;
  customerType?: string;
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
