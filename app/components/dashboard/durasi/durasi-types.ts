export type DurasiBucketKey =
  | 'all'
  | 'kpi_customer'
  | 'kpi_proactive'
  | 'non_kpi_unspec'
  | 'non_technical'
  | 'sqm_update'
  | 'obsolete';

export type DurasiPanelType =
  | 'REGULER'
  | 'HVC_DIAMOND_PLATINUM'
  | 'HVC_GOLD'
  | 'MANJA'
  | 'FFG'
  | 'SQM_UPDATE'
  | 'SQM'
  | 'ANAK_GAMAS'
  | 'HSI'
  | 'TSEL'
  | 'DATIN'
  | 'UNSPEC';

export interface DurasiDetailTarget {
  bucket: DurasiBucketKey;
  bucketLabel: string;
  panelType: DurasiPanelType;
  panelLabel: string;
  area: string;
  sa: string | null;
  bucketIndex: number;
  bucketName: string;
}

export interface DurasiDetailTicket {
  id_ticket: number;
  incident: string;
  summary: string | null;
  reported_date: string | null;
  status: string | null;
  status_update: string | null;
  customer_type: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
  guarantee_status: string | null;
  flagging_manja: string | null;
  manja_expired: string | null;
  ticket_id_gamas: string | null;
  workzone: string | null;
  area: string | null;
  region: string | null;
  closed_at: string | null;
  teknisi_name: string | null;
  duration_hours: number | null;
  source_panel: string;
  duration_bucket: string;
}

export interface DurasiDetailMeta {
  bucket: DurasiBucketKey;
  bucketLabel: string;
  panelType: DurasiPanelType;
  panelLabel: string;
  area: string;
  sa: string | null;
  bucketIndex: number;
  bucketName: string;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface DurasiDetailResponse {
  meta: DurasiDetailMeta;
  tickets: DurasiDetailTicket[];
}
