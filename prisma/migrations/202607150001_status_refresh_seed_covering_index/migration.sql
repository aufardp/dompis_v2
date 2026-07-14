-- Replace the 4-column seed index with a 6-column covering index that includes
-- status and sourceHash, letting the status-refresh seed query be served
-- entirely from the index without table lookups.
--
-- Seed query pattern:
--   SELECT incident, sourceTable, status, sourceHash
--   FROM ticket_raw
--   WHERE isActive = true
--     AND sourceTable IN (...)
--     AND sourceUpdatedAt < hotWindowStart
--     AND incident IS NOT NULL
--   ORDER BY sourceUpdatedAt DESC, id_ticket ASC
--   LIMIT 500

SET @old_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_status_refresh_seed'
);

SET @drop_ddl := IF(
  @old_exists > 0,
  'DROP INDEX `idx_ticket_raw_status_refresh_seed` ON `ticket_raw`',
  'SELECT 1'
);
PREPARE drop_stmt FROM @drop_ddl;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

CREATE INDEX `idx_ticket_raw_status_refresh_seed`
  ON `ticket_raw`(`isActive`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC, `status`, `sourceHash`);
