-- Additive indexes for status-refresh hot/safety candidate selection.
-- Safe to run online with maintenance window awareness.

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_active_source_incident'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_raw_active_source_incident` ON `ticket_raw`(`isActive`, `sourceTable`, `incident`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_active_source_updated_incident'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_raw_active_source_updated_incident` ON `ticket_raw`(`isActive`, `sourceTable`, `sourceUpdatedAt`, `incident`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
