-- Add a dedicated index on isActive for COUNT(*) queries.
-- The existing composite indexes starting with isActive are too large
-- for a fast COUNT(*) scan; a single-column index is much smaller.
--
-- Affected query:
--   SELECT COUNT(*)
--   FROM ticket_raw
--   WHERE isActive = true

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_isActive'
);

SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_raw_isActive` ON `ticket_raw`(`isActive`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
