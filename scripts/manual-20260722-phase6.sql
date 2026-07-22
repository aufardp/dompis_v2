-- ============================================================
-- Phase 6 — Data-Worker Stabilization
-- Eksekusi manual via phpMyAdmin
-- ============================================================

-- ============================================================
-- STEP 1: Re-create seed index v2 with incident column
-- Drop old index, create new one with incident as 2nd column
-- Durasi: ~3-5 detik (MySQL rebuild)
-- ============================================================
DROP INDEX `idx_ticket_raw_status_refresh_seed_v2` ON `ticket_raw`;

CREATE INDEX `idx_ticket_raw_status_refresh_seed_v2`
  ON `ticket_raw`(`isActive`, `incident`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC, `status`, `sourceHash`);

-- ============================================================
-- VERIFIKASI
-- ============================================================
-- SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
-- FROM INFORMATION_SCHEMA.STATISTICS
-- WHERE TABLE_SCHEMA = 'bot_dompis_db'
--   AND TABLE_NAME = 'ticket_raw'
--   AND INDEX_NAME = 'idx_ticket_raw_status_refresh_seed_v2'
-- ORDER BY SEQ_IN_INDEX;
