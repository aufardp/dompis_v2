// Type definitions for Cluster Management feature

export interface Cluster {
  id: number;
  sa_id: number;
  nama_cluster: string;
  is_active: boolean;
  sort_order: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface TeknisiToday {
  id_user: number;
  nama: string | null;
  nik: string | null;
}

export interface ClusterWithStats extends Cluster {
  node_count: number; // jumlah ODC dalam cluster
  area_names: string[]; // nama-nama wilayah
  teknisi_today: TeknisiToday[]; // teknisi yang dijadwalkan hari ini
}

export interface ClusterArea {
  id: number;
  cluster_id: number;
  nama_area: string;
  sort_order: number;
}

export interface ClusterNode {
  id: number;
  cluster_id: number;
  cluster_area_id: number | null;
  odc_value: string | null; // contoh: "ODC-TDS-FEP"
  is_active: boolean;
  sort_order: number;
  created_at: string;
  area_name?: string; // dari join ke cluster_area
}

export interface ClusterAssignment {
  id: number;
  cluster_id: number;
  teknisi_id: number;
  assigned_date: string; // "2026-03-29"
  is_active: boolean;
  assigned_by: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  teknisi_nama?: string | null; // dari join ke users
  assigner_nama?: string | null; // dari join ke users
}

export interface AssignmentWithTeknisi extends ClusterAssignment {
  teknisi_nama: string | null;
  teknisi_nik: string | null;
  assigner_nama?: string | null;
}

export interface AutoAssignResult {
  assigned: boolean;
  ticketId: number;
  teknisiId?: number;
  teknisiNama?: string | null;
  clusterId?: number;
  clusterName?: string;
  reason?: 'no_cluster' | 'no_teknisi_today' | 'already_assigned' | 'no_active_nodes' | 'error';
}

export interface BulkImportResult {
  inserted: number;
  skipped: number; // ODC yang sudah ada di cluster lain
  errors: Array<{ odc_value: string; reason: string }>; // odc_value yang gagal beserta alasannya
}

export interface CopyResult {
  copied: number;
  skipped: number; // yang sudah ada di tanggal target
}

export interface WeeklySchedule {
  [date: string]: AssignmentWithTeknisi[];
}

// Input types untuk create/update operations
export interface CreateClusterInput {
  sa_id: number;
  nama_cluster: string;
  sort_order?: number;
}

export interface UpdateClusterInput {
  nama_cluster?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface CreateClusterAreaInput {
  nama_area: string;
  sort_order?: number;
}

export interface UpdateClusterAreaInput {
  nama_area: string;
  sort_order?: number;
}

export interface CreateClusterNodeInput {
  odc_value: string;
  cluster_area_id?: number;
  sort_order?: number;
}

export interface PlotTeknisiInput {
  cluster_id: number;
  teknisi_id: number;
  assigned_date: string;
  note?: string;
}

export interface CopyAssignmentInput {
  from_date: string;
  to_date: string;
  sa_id: number;
}
