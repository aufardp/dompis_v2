SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_active_refresh_synced'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_active_refresh_synced` ON `ticket`(`synced_at`, `id_ticket`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
