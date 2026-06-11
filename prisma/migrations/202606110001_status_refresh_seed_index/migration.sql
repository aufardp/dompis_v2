-- Seed index for status-refresh datedCandidates query.
-- Matches the filter/order pattern:
--   isActive = true
--   sourceTable IN (...)
--   sourceUpdatedAt < hotWindowStart
--   ORDER BY sourceUpdatedAt DESC, id_ticket ASC

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_status_refresh_seed'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_raw_status_refresh_seed` ON `ticket_raw`(`isActive`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
