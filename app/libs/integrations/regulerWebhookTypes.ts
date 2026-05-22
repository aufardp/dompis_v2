export interface RegulerTicket {
  incident: string;
  reported_date: string | null;
  service_area: string | null;
  service_no: string | null;
  service_type: string | null;
  booking_date: string | null;
  jenis_tiket_2: string | null;
  guarantee_status: string | null;
  area: string | null;
  teknisi: string | null;
  status_update: string | null;
}

export interface BranchGroup {
  branch_id: number;
  branch_name: string;
  kode_branch: string;
  total_tickets: number;
  tickets: RegulerTicket[];
}

export interface RegulerBranchReportPayload {
  event_id: string;
  event_type: 'REGULER_BRANCH_REPORT';
  event_label: string;
  occurred_at: string;
  total_tickets: number;
  total_branches: number;
  generated_at: string;
  branches: BranchGroup[];
}

export interface RegulerWebhookConfig {
  url: string;
  secret: string;
}
