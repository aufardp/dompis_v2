export interface PreviewData {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  errors: { row: number; field: string; message: string }[];
  headers: string[];
  auto_mapping: Record<string, string | null>;
  sample: Record<string, any>[];
  missing_required: { key: string; label: string }[];
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  import_batch: string;
  uploaded_by?: string | null;
}

export type ProjectionBatchStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'aborted'
  | 'disabled';

export interface ImportProjectionStatus {
  import_batch: string;
  projected_at?: string | null;
  requested_at?: string | null;
  projection_status: ProjectionBatchStatus;
  checkpoint_status?: string | null;
  last_checkpoint_batch?: string | null;
  projection_enabled: boolean;
  row_count: number;
}

export interface LastUploadInfo {
  import_batch: string;
  imported_at: string;
  row_count: number;
  uploaded_by?: string | null;
}
