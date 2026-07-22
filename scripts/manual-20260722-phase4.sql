-- ============================================================
-- Phase 4 — INSERT Stabilization & Server Duplication Fix
-- Eksekusi manual via phpMyAdmin
-- Urutan: ADD index dulu (cepat), baru DROP indexes (berat)
-- ============================================================

-- ============================================================
-- STEP 1: Add missing index on ticket_projection_log.projectedAt
-- Durasi: < 1 detik
-- ============================================================
ALTER TABLE `ticket_projection_log`
  ADD INDEX `idx_ticket_projection_log_projected_at` (`projectedAt`);

-- ============================================================
-- STEP 2: Drop 7 redundant indexes on ticket_raw
-- Masing-masing durasi: 1-3 detik (MySQL rebuild index)
-- Eksekusi satu per satu, tunggu selesai baru lanjut
-- ============================================================

-- 2a. Covered by idx_ticket_raw_imported_incident (importedAt, incident)
DROP INDEX `ticket_raw_importedAt_idx` ON `ticket_raw`;

-- 2b. Covered by @@index([isActive, lastSeenAt])
DROP INDEX `ticket_raw_lastSeenAt_idx` ON `ticket_raw`;

-- 2c. Covered by @@index([sourceTable, sourceUpdatedAt])
DROP INDEX `ticket_raw_sourceUpdatedAt_idx` ON `ticket_raw`;

-- 2d. Covered by idx_ticket_raw_active_source_updated_incident (isActive, sourceTable, sourceUpdatedAt, incident)
DROP INDEX `idx_ticket_raw_active_source_incident` ON `ticket_raw`;

-- 2e. Covered by idx_ticket_raw_status_refresh_nulls (isActive, sourceTable, sourceUpdatedAt, lastSeenAt DESC, importedAt DESC, id_ticket)
DROP INDEX `ticket_raw_sourceTable_lastSeenAt_idx` ON `ticket_raw`;

-- 2f. Covered by idx_ticket_raw_active_cursor (isActive, importedAt, id_ticket)
DROP INDEX `idx_ticket_raw_projection_cursor` ON `ticket_raw`;

-- 2g. Covered by idx_ticket_raw_projection_batch_cursor (syncBatchId, importedAt, id_ticket)
DROP INDEX `ticket_raw_sourceTable_syncBatchId_idx` ON `ticket_raw`;

-- ============================================================
-- STEP 3 (optional): Check & drop duplicate index
-- Hanya jalankan jika index berikut masih ada:
--   ticket_raw_projection_cursor_idx (isActive, importedAt, id_ticket)
-- Ini adalah DUPLICATE dari idx_ticket_raw_active_cursor (kolom sama)
-- ============================================================
-- Uncomment jika ingin di-drop:
-- DROP INDEX `ticket_raw_projection_cursor_idx` ON `ticket_raw`;

-- ============================================================
-- VERIFIKASI: Cek sisa index di ticket_raw
-- ============================================================
-- SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
-- FROM INFORMATION_SCHEMA.STATISTICS
-- WHERE TABLE_SCHEMA = 'bot_dompis_db' AND TABLE_NAME = 'ticket_raw'
-- ORDER BY INDEX_NAME, SEQ_IN_INDEX;
