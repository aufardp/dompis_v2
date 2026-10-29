-- Index untuk query dashboard Rekap Workorder yang time out di production.
--
-- Gejala (log 2026-10-29 01:21–01:22):
--   - rekap-workorder/trend        → 3024 (MAX_EXECUTION_TIME 30s)
--   - rekap-workorder/hourly-close → 3024 (MAX_EXECUTION_TIME 30s)
--   - Rekap aging query            → 3024 (MAX_EXECUTION_TIME 30s)
--   - rekap-workorder (utama)      → 60s, socket_timeout Prisma habis
--     ("Server has closed the connection"), `SELECT 1` ikut lambat 5s.
--
-- Penyebab:
--   1. `idx_ticket_booking_date` dan `idx_ticket_closed_booking` sudah
--      dideklarasikan di schema.prisma (commit 0fb3c94) tetapi TIDAK PERNAH
--      dibuat lewat migration — production tidak memilikinya, jadi query
--      trend/closed full table scan ±800k baris (banyak kolom TEXT).
--   2. `closed_at` tidak punya index yang bisa dipakai sebagai leading
--      column untuk filter rentang `closed_at >= ? AND closed_at < ?`
--      (idx_ticket_dashboard_main leading `workzone`, tidak terpakai untuk
--      superadmin yang tidak memfilter workzone).
--   3. Filter status untuk agregat "tiket aktif" (rekap & aging) tidak punya
--      index yang murah: `idx_ticket_ops_summary` lebar (9 kolom) dan tidak
--      mencakup closed_at.
--
-- Semua ADD INDEX memakai ALGORITHM=INPLACE, LOCK=NONE supaya ingestion
-- (bulk upsert tiap 1–2 menit) tidak terblokir.

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_booking_date'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_booking_date (booking_date), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- closed_at sebagai leading column: range scan "closed hari ini" (hourly-close,
-- trend close-branch, cabang closed dari filter harian) hanya membaca ribuan
-- baris, bukan seluruh tabel.
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_closed_booking'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_closed_booking (closed_at, booking_date), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- status + closed_at: dipakai agregat tiket aktif (rekap workorder, aging)
-- yang memakai `status NOT IN (...)` / `status IN (close statuses)`.
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_status_closed_at'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_status_closed_at (status, closed_at), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Filter harian mode "legacy" (dipakai getLegacyCustomerBucketRows untuk kartu
-- customer b2c/b2b) punya cabang OR `pending_dompis IS NOT NULL AND != ''
-- AND status != 'closed'`. Tanpa index, cabang itu memaksa full table scan
-- walaupun tiga cabang lain memakai idx_ticket_sync_date.
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_pending_dompis'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_pending_dompis (pending_dompis), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
