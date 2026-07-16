-- Extend idx_ticket_dashboard_main to include reported_date for ORDER BY optimization.
--
-- Dashboard queries use the pattern:
--   WHERE workzone IN (...) AND (<status branch>)
--   ORDER BY reported_date ASC/DESC
--   LIMIT ?, ?
--
-- The ROW_NUMBER() OVER (ORDER BY reported_date ASC) window function
-- was doing filesort because reported_date wasn't in the index.
-- Adding it at the end allows MySQL to scan the index pre-sorted.
--
-- Steps:
--   1. RENAME old idx_ticket_dashboard_main to _old (INSTANT, metadata-only)
--   2. CREATE new idx_ticket_dashboard_main +reported_date (INSTANT)
--   3. DROP _old (INSTANT, metadata-only)

-- Step 1: Rename old index
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

-- Step 2: Create new index with reported_date
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_dashboard_main'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_dashboard_main (workzone, status, status_update, closed_at, reported_date), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Drop old renamed index
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
-- Extend idx_ticket_teknisi_dashboard (same pattern for teknisi role)
-- ============================================================

-- Step 4: Rename old teknisi index
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

-- Step 5: Create new teknisi index with reported_date
SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_teknisi_dashboard'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_teknisi_dashboard (teknisi_user_id, status, status_update, closed_at, reported_date), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 6: Drop old renamed teknisi index
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
