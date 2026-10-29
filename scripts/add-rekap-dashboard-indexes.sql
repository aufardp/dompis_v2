-- Index untuk halaman Rekap Workorder (production).
-- Sama isinya dengan prisma/migrations/20261029000000_fix_rekap_dashboard_indexes/.
-- Jalankan manual kalau `prisma migrate deploy` tidak dipakai di server:
--   mysql -u root -p dompis_db < scripts/add-rekap-dashboard-indexes.sql
--
-- Tanpa index ini:
--   - /api/dashboard/rekap-workorder/trend        → error 3024 (30s)
--   - /api/dashboard/rekap-workorder/hourly-close → error 3024 (30s)
--   - rekap aging                                 → error 3024 (30s)
--   - /api/dashboard/rekap-workorder              → 60s (socket_timeout Prisma)
-- Semua ADD INDEX memakai INPLACE + LOCK=NONE supaya ingestion tidak terblokir.

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ticket'
    AND index_name = 'idx_ticket_booking_date'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_booking_date (booking_date), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ticket'
    AND index_name = 'idx_ticket_closed_booking'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_closed_booking (closed_at, booking_date), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ticket'
    AND index_name = 'idx_ticket_status_closed_at'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_status_closed_at (status, closed_at), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ticket'
    AND index_name = 'idx_ticket_pending_dompis'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_pending_dompis (pending_dompis), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Setelah index dibuat, perbarui statistik optimizer:
-- ANALYZE TABLE ticket;
--
-- Verifikasi cepat (harus < 1 detik):
-- EXPLAIN SELECT HOUR(closed_at) AS hour, COUNT(*) AS count FROM ticket
--   WHERE closed_at >= CURDATE() AND closed_at < CURDATE() + INTERVAL 1 DAY
--     AND status IN ('CLOSED','CLOSE','FINALCHECK','MEDIACARE','SALAMSIM','RESOLVED')
--   GROUP BY HOUR(closed_at);
--
-- EXPLAIN SELECT DATE_FORMAT(DATE(booking_date + INTERVAL 7 HOUR), '%Y-%m-%d') AS day, COUNT(*)
--   FROM ticket WHERE booking_date IS NOT NULL AND booking_date >= '2026-10-22 00:00:00'
--   GROUP BY day;
