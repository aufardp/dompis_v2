-- Add covering indexes for dashboard queries on `ticket` table.
--
-- Dashboard queries use the pattern:
--   WHERE workzone IN (...) AND (
--     status NOT IN ('closed',...)
--     OR (status IN ('closed',...) AND closed_at >= ?)
--     OR (pending_dompis IS NOT NULL AND ...)
--   )
--
-- The new composite index (workzone, status, status_update, closed_at)
-- allows MySQL to use the index for both the workzone filter and the
-- status/closed_at branches, avoiding full scan of 50k+ rows per workzone.

-- ============================================================
-- 1. ADD NEW INDEXES
-- ============================================================

-- P1: Universal dashboard pattern (workzone + status/closed_at/pending)
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_dashboard_main'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_dashboard_main` ON `ticket`(`workzone`, `status`, `status_update`, `closed_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- P2: Teknisi dashboard (teknisi_user_id + status/closed_at/pending)
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_teknisi_dashboard'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_teknisi_dashboard` ON `ticket`(`teknisi_user_id`, `status`, `status_update`, `closed_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2. FIX projection_request SLOW QUERY (15s)
-- ============================================================

-- Query: SELECT ... FROM projection_request WHERE source = 'import-tiket'
--          AND sync_batch_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'projection_request'
    AND index_name = 'idx_projection_request_source_created'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_projection_request_source_created` ON `projection_request`(`source`, `sync_batch_id`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. DROP UNUSED sync_date INDEXES
--    (dipisahkan agar bisa di-skip jika ingin)
-- ============================================================

-- These indexes were designed for the old nightly-batch pattern
-- that filtered by sync_date = today. Dashboard queries no longer
-- use sync_date; they use status/closed_at/pending_dompis instead.

-- Set @skip_drop = 1 if you want to skip dropping old indexes
SET @skip_drop := 0;

-- idx_ctype_sync (customer_type, sync_date)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ctype_sync` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ctype_sync'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_pending_sync (pending_reason, sync_date)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_pending_sync` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_pending_sync'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ticket_daily_sync_status_reported (sync_date, status, reported_date)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ticket_daily_sync_status_reported` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ticket_daily_sync_status_reported'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_sync_status (sync_date, status_update)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_sync_status` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_sync_status'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_sync_workzone (sync_date, workzone)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_sync_workzone` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_sync_workzone'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ticket_autoassign_daily (sync_date, teknisi_user_id, status_update, rk_information, jam_expired)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ticket_autoassign_daily` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ticket_autoassign_daily'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_sync_date_jenis1 (sync_date, jenis_tiket_1)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_sync_date_jenis1` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_sync_date_jenis1'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ops_sync_ctype_status (sync_date, customer_type, status_update)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ops_sync_ctype_status` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ops_sync_ctype_status'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ops_sync_ctype_jenis2 (sync_date, customer_type, jenis_tiket_2)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ops_sync_ctype_jenis2` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ops_sync_ctype_jenis2'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ticket_daily_board (sync_date, status_update, booking_date, customer_type)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ticket_daily_board` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ticket_daily_board'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ticket_daily_validasi (sync_date, status_update, reported_date, customer_type)
SET @ddl := IF(@skip_drop = 0,
  (SELECT IF(COUNT(*) > 0, 'DROP INDEX `idx_ticket_daily_validasi` ON `ticket`', 'SELECT 1')
   FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket' AND index_name = 'idx_ticket_daily_validasi'),
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
