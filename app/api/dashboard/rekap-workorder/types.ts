// Tipe bersama untuk domain Rekap Workorder — dipisah dari route.ts (yang
// tadinya 2100+ baris) semata untuk memecah unit kompilasi jadi lebih kecil.
// Tidak ada perubahan logic di file ini, murni definisi tipe.

export interface RekapTicketRow {
  area: string;
  sa_name: string;
  workzone: string | null;
  customer_type: string | null;
  customer_segment: string | null;
  jenis_tiket: string | null;
  status: string;
  status_update: string;
  closed_at: Date | null;
  cnt: bigint;
  source_ticket: string | null;
  classification_flag: string | null;
  classification_path: string | null;
  is_sqm_update: boolean;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
}

export interface CustomerSqmOverlayRow extends RekapTicketRow {
  overlay_kind: 'proactive' | 'sqm_update';
}

export interface LegacyCustomerBucketRow {
  area: string;
  sa_name: string;
  workzone: string;
  status: string;
  status_update: string;
  cnt: bigint;
}

export interface SegCount {
  open: number;
  close: number;
}

export interface StatusCounts {
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

export interface AgingRow {
  saName: string;
  openCount: number;
  oldestAt: Date | string | null;
  g24: number;
  g48: number;
  g72: number;
}

export type BucketKey =
  | 'kpiCustomer'
  | 'kpiProactive'
  | 'nonKpiUnspec'
  | 'nonTechnical'
  | 'sqmUpdate'
  | 'obsolete';

export interface BucketRecord {
  kpiCustomer: SegCount;
  kpiProactive: SegCount;
  nonKpiUnspec: SegCount;
  nonTechnical: SegCount;
  sqmUpdate: SegCount;
  obsolete: SegCount;
}

export interface DetailGroup {
  b2c: Record<string, SegCount>;
  b2b: Record<string, SegCount>;
  netral: Record<string, SegCount>;
}

// Agregat Open/Close per segmen customer (B2C = customer_segment IN
// ('DCS','PL-TSEL'), selain itu B2B) — selalu terisi terlepas dari mode
// filter bucket, beda dari `detail.b2c`/`detail.b2b` yang granular per
// jenis tiket dan cuma terisi bermakna di mode tertentu.
export interface SegmentTotal {
  b2c: SegCount;
  b2b: SegCount;
  netral: SegCount;
}

export interface WorkzoneRow {
  workzone: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  gamas: SegCount;
  status: StatusCounts;
  segmentTotal: SegmentTotal;
  totalOpen: number;
  totalClose: number;
  totalAll: number;
}

export interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  teknisiTerdaftar: number;
  teknisiCoverage: number;
  woPerTeknisi: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  gamas: SegCount;
  status: StatusCounts;
  workzones: WorkzoneRow[];
  segmentTotal: SegmentTotal;
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

export interface KpiSummaryCounts {
  total: number;
  kpiCustomer: number;
  kpiProactive: number;
  nonKpiUnspec: number;
  nonTechnical: number;
  sqmUpdate: number;
  obsolete: number;
}

export interface BucketSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

export interface BucketBreakdownCounts {
  kpiCustomer: BucketSummaryCounts;
  kpiProactive: BucketSummaryCounts;
  nonKpiUnspec: BucketSummaryCounts;
  nonTechnical: BucketSummaryCounts;
  sqmUpdate: BucketSummaryCounts;
  obsolete: BucketSummaryCounts;
}

export interface WorkboardSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

export interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
  aging: AgingRow[];
  kpiSummary: KpiSummaryCounts;
  bucketSummary: BucketSummaryCounts;
  bucketBreakdown: BucketBreakdownCounts;
  workboardSummary: WorkboardSummaryCounts;
  selectedBucket: string;
}
