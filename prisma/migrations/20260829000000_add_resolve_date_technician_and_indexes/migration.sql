-- Tambah kolom resolve_date (dari Nossa endpoint) dan technician
-- ke tabel ticket, serta update 4 index dashboard/lookup
-- agar menggunakan resolve_date sebagai acuan kepatuhan.
-- Additive only.

-- ============================================================
-- 1. TAMBAH KOLOM BARU
-- ============================================================

ALTER TABLE `ticket`
  ADD COLUMN `resolve_date` TIMESTAMP(0) NULL,
  ADD COLUMN `technician` VARCHAR(255) NULL;

-- ============================================================
-- 2. UPDATE idx_ticket_dashboard_main
--    Sebelum: (workzone, status, status_update, closed_at, reported_date)
--    Sesudah: (workzone, status, status_update, closed_at, resolve_date, classification_path, source_ticket, reported_date)
-- ============================================================

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_dashboard_main'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket RENAME INDEX idx_ticket_dashboard_main TO idx_ticket_dashboard_main_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_dashboard_main'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_dashboard_main (workzone, status, status_update, closed_at, resolve_date, classification_path, source_ticket, reported_date), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_dashboard_main_old'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket DROP INDEX idx_ticket_dashboard_main_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. UPDATE idx_ticket_teknisi_dashboard
--    Sebelum: (teknisi_user_id, status, status_update, closed_at, reported_date)
--    Sesudah: (teknisi_user_id, status, status_update, closed_at, resolve_date, reported_date)
-- ============================================================

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_teknisi_dashboard'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket RENAME INDEX idx_ticket_teknisi_dashboard TO idx_ticket_teknisi_dashboard_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_teknisi_dashboard'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_teknisi_dashboard (teknisi_user_id, status, status_update, closed_at, resolve_date, reported_date), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_teknisi_dashboard_old'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket DROP INDEX idx_ticket_teknisi_dashboard_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. UPDATE idx_ticket_rca_lookup
--    Sebelum: (device_name, rca, sub_rca, closed_at)
--    Sesudah: (device_name, rca, sub_rca, closed_at, resolve_date)
-- ============================================================

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_rca_lookup'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket RENAME INDEX idx_ticket_rca_lookup TO idx_ticket_rca_lookup_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_rca_lookup'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_rca_lookup (device_name, rca, sub_rca, closed_at, resolve_date), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_rca_lookup_old'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket DROP INDEX idx_ticket_rca_lookup_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 5. UPDATE idx_ticket_ttr_comply
--    Sebelum: (ttr_comply_status, closed_at)
--    Sesudah: (ttr_comply_status, resolve_date)
-- ============================================================

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_ttr_comply'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket RENAME INDEX idx_ticket_ttr_comply TO idx_ticket_ttr_comply_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_ttr_comply'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_ttr_comply (ttr_comply_status, resolve_date), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_ttr_comply_old'
);

SET @stmt := IF(@index_exists > 0,
  'ALTER TABLE ticket DROP INDEX idx_ticket_ttr_comply_old, ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;