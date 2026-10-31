// app/libs/priority/types.ts

export type PriorityBranchCode = 'PKL' | 'DPS' | 'MTR' | 'KPG' | 'FLO';
export type PriorityKind = 'disruption' | 'gaul' | 'ttr';
export type TtrBucket = 'diamond_vvip' | 'platinum' | 'manja' | 'reguler';
export type TtrState = 'safe' | 'near' | 'over';
export type TtrStateFilter = 'within' | 'near' | 'over' | 'all';

export interface TtrCount {
  open: number;
  within: number;
  near: number;
  over: number;
}

export interface BranchSummary {
  code: PriorityBranchCode;
  name: string;
  open_sqm_unspec: number;
  potential_disruption: number;
  potential_gaul: number;
  ttr: Record<TtrBucket, TtrCount>;
}

export interface PrioritySummaryMeta {
  unknown_deadline: number;
  invalid_future_date: number;
  branch_workzone_count: number;
  ttr_rows_scanned: number;
}

export interface PrioritySummaryResponse {
  generated_at: string;
  data_as_of: string;
  stale: boolean;
  stale_after_minutes: number;
  branches: BranchSummary[];
  totals: BranchSummary;
  meta: PrioritySummaryMeta;
}

export interface PriorityTicketRowBase {
  id_ticket: number;
  incident: string;
  service_no: string;
  customer_name: string;
  workzone: string;
  jenis_tiket_2: string;
  reported_date_dt: string | null;
  status: string | null;
  status_update: string | null;
}

export interface DisruptionEvidence {
  tickets_30d: number;
  has_reg_hvc_30d: boolean;
}

export interface GaulEvidence {
  last_reg_hvc_at: string | null;
  last_reg_hvc_incident: string | null;
}

export interface TtrTicketEvidence {
  bucket: TtrBucket;
  customer_type: string | null;
  flagging_manja: string | null;
  booking_date: string | null;
  deadline_at: string | null;
  remaining_ms: number | null;
  ttr_state: TtrState;
  deadline_source: 'reported' | 'booking' | 'unknown';
}

export type PriorityTicketRow =
  | (PriorityTicketRowBase & {
      kind: 'disruption';
      evidence: DisruptionEvidence;
    })
  | (PriorityTicketRowBase & {
      kind: 'gaul';
      evidence: GaulEvidence;
    })
  | (PriorityTicketRowBase & {
      kind: 'ttr';
      evidence: TtrTicketEvidence;
    });

export interface PriorityTicketsQueryParams {
  branch: PriorityBranchCode;
  kind: PriorityKind;
  bucket?: TtrBucket;
  state?: TtrStateFilter;
  q?: string;
  page?: number;
  limit?: number;
}

export interface PriorityTicketsMeta {
  branch: PriorityBranchCode;
  branch_name: string;
  kind: PriorityKind;
  bucket?: TtrBucket;
  state: TtrStateFilter;
  q: string | null;
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  counts?: {
    all: number;
    within: number;
    near: number;
    over: number;
  };
}

export interface PriorityTicketsResponse {
  meta: PriorityTicketsMeta;
  rows: PriorityTicketRow[];
}

export interface PriorityExportParams {
  scope: 'summary' | 'tickets';
  branch?: PriorityBranchCode;
  kind?: PriorityKind;
  bucket?: TtrBucket;
  state?: TtrStateFilter;
  q?: string;
}

export interface BranchCardSummary {
  reguler_open: number;
  sqm_open: number;
  underspec_open: number;
  total_open: number;
}

export interface RegulerSummary {
  saldo_open: number;
  osla: number;
  open_hi: number;
  close_hi: number;
}

export interface RegulerTtrCounts {
  diamond_vvip: { all: number; within: number; over: number };
  platinum: { all: number; within: number; over: number };
  manja: { all: number; within: number; over: number };
  reguler: { all: number; within: number; over: number };
}

export interface SQMUnderspecCounts {
  sqm_disruption: number;
  sqm_gaul: number;
  underspec_disruption: number;
  underspec_gaul: number;
}

export interface BranchFullPrioritySummary {
  code: PriorityBranchCode;
  name: string;
  card: BranchCardSummary;
  reguler_summary: RegulerSummary;
  reguler_ttr: RegulerTtrCounts;
  sqm_underspec: SQMUnderspecCounts;
}

export interface PrioritySummaryData {
  last_update: string;
  total_saldo_open: number;
  total_over_sla: number;
  branches: Record<PriorityBranchCode, BranchFullPrioritySummary>;
}