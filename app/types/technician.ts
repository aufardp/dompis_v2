import { Ticket, TicketCtype, TicketVisitStatus } from './ticket';

export type TechnicianStatus = 'IDLE' | 'AKTIF' | 'OVERLOAD';

export interface TechnicianTicket {
  idTicket: number;
  ticket: string;
  contactName: string;
  ctype: TicketCtype;
  serviceNo: string;
  reportedDate: string;
  hasilVisit: TicketVisitStatus;
  age: string;
  ageHours: number;
  closedAt?: string | null;
}

export interface TechnicianOrderCounts {
  assigned: number;
  on_progress: number;
  pending: number;
  closed: number;
}

export interface Technician {
  id_user: number;
  nama: string;
  nik: string | null;
  workzone: string;
  avatar_url?: string | null;
  assigned_tickets: TechnicianTicket[];
  closed_tickets_today?: TechnicianTicket[];
  total_assigned: number;
  total_closed_today: number;
  average_resolve_time_hours: number | null;
  order_counts?: TechnicianOrderCounts;
}

export interface TechnicianSummary {
  total_active: number;
  total_assigned: number;
  overload_count: number;
  idle_count: number;
}

export interface TechnicianFilters {
  search?: string;
  workzone?: string;
  status?: TechnicianStatus | 'all';
}

export interface TechnicianApiResponse {
  success: boolean;
  data?: {
    technicians: Technician[];
    summary: TechnicianSummary;
    userWorkzones: string[];
  };
  message?: string;
}
