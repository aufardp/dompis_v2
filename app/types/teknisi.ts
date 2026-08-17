export interface Teknisi {
  id_user: number;
  nama: string | null;
  nik: string | null;
  checked_in_today?: boolean;
  active_tickets?: number;
  assigned_count?: number;
  on_progress_count?: number;
  pending_count?: number;
  avg_ttr_hours?: number | null;
  overloaded?: boolean;
  load_score?: number;
  recommended?: boolean;
}