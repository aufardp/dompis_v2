import type { TicketCtype, TicketVisitStatus } from '@/app/types/ticket';

export type TicketStatusKey =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'CANCELLED'
  | 'CLOSE'
  | 'CLOSED';

export interface TicketDetail {
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
  hasilVisit?: TicketVisitStatus | null;
  bookingDate?: string;
  sourceTicket?: string;
  jenisTiket?: string;
  jenisTiket1?: string | null;
  ticketIdGamas?: string | null;
  flaggingManja?: string | null;
  flaggingDatin?: string | null;
  guaranteeStatus?: string | null;
  worklogSummary?: string | null;
  solution?: string | null;
  descriptionActualSolution?: string | null;
  descriptionSolutionDompis?: string | null;
  channel?: string | null;
  witel?: string | null;
  incidentDomain?: string | null;
  customerName?: string | null;
  statusDate?: string | null;
  realm?: string | null;
  snOnt?: string | null;
  tipeOnt?: string | null;
  onuRx?: string | null;
  rkInformation?: string | null;
  classificationFlag?: string | null;
  classificationPath?: string | null;
  lapul?: string | null;
  gaul?: string | null;
  tscResult?: string | null;
  sccResult?: string | null;
  hours?: string | null;
  durasiTicket?: string | null;
  jamExpired?: string | null;
  manjaExpired?: string | null;
  statusManja?: string | null;
  statusTtr12Gold?: string | null;
  statusTtr3Diamond?: string | null;
  statusTtr24Reguler?: string | null;
  statusTtr6Platinum?: string | null;
  statusTtrDatinK1?: string | null;
  statusTtrDatinK2?: string | null;
  statusTtrDatinK3?: string | null;
  statusTtrIndibiz4Jam?: string | null;
  statusTtrReseller6Jam?: string | null;
  statusTtrWifiId?: string | null;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  pendingDompis?: string | null;
  rca?: string | null;
  subRca?: string | null;
  teknisiUserId?: number | null;
  technicianName?: string | null;
  closedAt?: string | null;
  statusUpdate?: string | null;
  status_update?: string | null;
  syncDate?: string | null;
  syncedAt?: string | null;
  importBatch?: string | null;
  tracking?: {
    assignedAt: string | null;
    assignedBy: string | null;
    assignedTo: string | null;
    pickedUpAt: string | null;
    onProgressAt: string | null;
    pendingAt: string | null;
    closedAt: string | null;
    pendingDompis: string | null;
  } | null;
  activityLog?: Array<{
    id: number;
    type: string;
    description: string | null;
    userName: string | null;
    roleId: number;
    createdAt: string;
  }>;
  assignmentHistory?: Array<{
    id: number;
    assignerName: string | null;
    technicianName: string | null;
    assignedAt: string;
    unassignedAt: string | null;
    isActive: boolean;
  }>;
}

export interface EvidenceItem {
  id: number;
  fileName: string;
  filePath: string;
  url: string;
  driveUrl: string | null;
}

export interface TicketDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  ticket: TicketDetail | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onEdit?: (ticket: TicketDetail) => void;
  onUpdateStatus?: (ticket: TicketDetail) => void;
}

export type TabKey = 'umum' | 'customer' | 'teknis' | 'sla' | 'tracking';
