-- Add `incident` to the covering index so that the status-refresh seed query
-- is served entirely from the index without table lookups.
--
-- Seed query pattern:
--   SELECT incident, sourceTable, status, sourceHash
--   FROM ticket_raw
--   WHERE isActive = true
--     AND incident IS NOT NULL
--     AND sourceTable IN (...)
--     AND sourceUpdatedAt < hotWindowStart
--   ORDER BY sourceUpdatedAt DESC, id_ticket ASC
--   LIMIT 500
--
-- Without incident in the index, MySQL needed a clustered-index lookup for
-- every candidate row just to check `incident IS NOT NULL`.

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
  ON `ticket_raw`(`isActive`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC, `incident`, `status`, `sourceHash`);
