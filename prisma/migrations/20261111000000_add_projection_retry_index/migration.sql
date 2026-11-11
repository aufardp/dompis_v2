-- Supports the projection retry query:
-- status = 'failed', ORDER BY updated_at, with attempts checked while scanning.
-- Include the primary key automatically through InnoDB's secondary index
-- layout so the worker can fetch only `id` from this index.

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_projection_log'
    AND index_name = 'idx_projection_log_retry'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket_projection_log ADD INDEX idx_projection_log_retry (status, updated_at, attempts), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
