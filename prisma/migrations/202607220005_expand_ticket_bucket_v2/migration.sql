-- ============================================================
-- Phase 7: Expand idx_ticket_bucket_v2 dengan closed_at + pending_dompis
-- ============================================================
-- Alasan: Dashboard queries menggunakan daily filter yang
-- butuh closed_at dan pending_dompis, tapi kedua kolom tidak
-- ada di index leaf → MySQL clustered lookup per row → 9-30s.
-- Dengan kolom tambahan di index, index jadi covering untuk
-- WHERE clause → semua filter dibaca dari index leaf saja.
-- ============================================================

DROP INDEX `idx_ticket_bucket_v2` ON `ticket`;
ALTER TABLE `ticket` ADD INDEX `idx_ticket_bucket_v2`
  (`workzone`, `source_ticket`, `status`, `status_update`, `classification_path`, `closed_at`, `pending_dompis`);
