SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'status_refresh_ticket_state'
    AND index_name = 'idx_status_refresh_due_incident'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_status_refresh_due_incident` ON `status_refresh_ticket_state`(`lastCheckedAt`, `incident`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
