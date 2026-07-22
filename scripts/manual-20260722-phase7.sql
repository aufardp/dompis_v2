-- ============================================================
-- Phase 7: max_execution_time 5s + expand covering index
-- ============================================================
-- Alasan: Query dashboard cold-cache butuh 9-30s karena
-- idx_ticket_bucket_v2 tidak mencakup closed_at dan pending_dompis.
-- Dengan 5s timeout + index expand, query di-kill 6× lebih cepat
-- dan yang selamat finish lebih cepat karena covering index.
-- ============================================================

-- STEP 1: Set global max_execution_time = 5s (semua koneksi baru)
SET GLOBAL max_execution_time = 5000;

-- STEP 2: Expand covering index — tambah closed_at + pending_dompis
DROP INDEX `idx_ticket_bucket_v2` ON `ticket`;
ALTER TABLE `ticket` ADD INDEX `idx_ticket_bucket_v2`
  (`workzone`, `source_ticket`, `status`, `status_update`, `classification_path`, `closed_at`, `pending_dompis`);

-- STEP 3: Verifikasi
-- SHOW VARIABLES LIKE 'max_execution_time';
-- SHOW INDEX FROM ticket WHERE Key_name = 'idx_ticket_bucket_v2';
-- +--------------------+-------+
-- | Variable_name      | Value |
-- +--------------------+-------+
-- | max_execution_time | 5000  |
-- +--------------------+-------+
