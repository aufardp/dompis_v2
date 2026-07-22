-- Add idx_ticket_daily_board for dashboard daily queries.
-- Leading sync_date narrows daily board queries to 1 day (~2000 rows)
-- instead of full table scan via workzone IN (34 values).
--
-- Steps:
--   1. CREATE idx_ticket_daily_board (sync_date, workzone, status, status_update, closed_at, reported_date)
--   2. CREATE idx_ticket_bucket (source_ticket, classification_path, status)

-- Step 1: Create daily board index
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_daily_board'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_daily_board (sync_date, workzone, status, status_update, closed_at, reported_date), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Create bucket classification index
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_bucket'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_bucket (source_ticket, classification_path, status), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
