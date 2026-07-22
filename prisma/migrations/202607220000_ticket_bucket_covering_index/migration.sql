-- Create idx_ticket_bucket_v2 covering index for dashboard bucket queries.
-- Covers: WHERE source_ticket, workzone, status, status_update, classification_path
--         GROUP BY status, status_update
--
-- Leading source_ticket seeks to ~120K rows (instead of full 380K scan).
-- All 5 columns cover the WHERE + GROUP BY for countStatuses() query:
--   SELECT status, status_update, COUNT(*) AS count
--   FROM ticket
--   WHERE workzone IN (...) AND source_ticket IN (?,?)
--     AND (classification_path IS NULL OR classification_path != 'Z_PERMINTAAN_044')
--   GROUP BY status, status_update

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_bucket_v2'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_bucket_v2 (source_ticket, workzone, status, status_update, classification_path), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
