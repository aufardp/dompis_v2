// ==========================================
// Tipe response QOSMIC Metabase Bridge
// Sumber: OpenAPI 1.0.0 (dikonfirmasi dari Swagger docs pengguna, bukan tebakan)
// ==========================================

export type QosmicResource = 'nossa' | 'nossa_closed';

export interface QosmicMeta {
  count: number; // jumlah baris DI RESPONSE INI (bukan total keseluruhan tabel)
  limit: number;
  offset: number;
}

/**
 * Baris `data` dikembalikan "apa adanya dari Metabase (nama kolom asli)" —
 * artinya bentuknya dinamis, TIDAK ada daftar field tetap yang dijamin API.
 * Contoh resmi di dokumentasi hanya menunjukkan 5 kolom (Incident, Status,
 * Status_Date, Regional, Witel) untuk endpoint /nossa — ini KEMUNGKINAN BESAR
 * bukan daftar lengkap kolom asli (field seperti service_no, customer_id,
 * workzone detail, SLA, dll kemungkinan tetap ada tapi tidak ditampilkan di
 * contoh dokumentasi). Jangan asumsikan 5 kolom ini adalah SEMUA field yang
 * tersedia — normalizer di bawah didesain generik (menerima field apa pun)
 * justru karena ketidakpastian ini.
 */
export type QosmicRawRow = Record<string, unknown>;

export interface QosmicQueryResponse<T = QosmicRawRow> {
  ok: true;
  resource: QosmicResource;
  filters: Record<string, unknown>;
  meta: QosmicMeta;
  data: T[];
  generated_at: string; // ISO datetime
}

export interface QosmicErrorResponse {
  ok: false;
  error: string;
}

export type QosmicApiResponse<T = QosmicRawRow> =
  | QosmicQueryResponse<T>
  | QosmicErrorResponse;

// HTTP status → makna, sesuai docs (dipakai client.ts utk retry logic)
export const QOSMIC_STATUS_MEANING: Record<number, string> = {
  200: 'OK',
  401: 'Token tidak ada / tidak valid / kedaluwarsa — TIDAK retryable',
  422: 'Parameter tidak valid (mis. seluruh date range < 2026-01-01) — TIDAK retryable',
  429: 'Rate limit terlampaui — retryable, hormati header Retry-After',
  502: 'Gagal mengambil data dari Metabase (koneksi/login/query) — retryable',
};
