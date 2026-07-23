-- Add covering index for validasi dashboard queries.
--
-- Validasi query pattern:
--   SELECT COUNT(*) / id_ticket
--   FROM ticket
--   WHERE needs_validation = true
--     AND status NOT IN ('close', 'closed')
--     AND workzone IN (...)
--   ORDER BY reported_date DESC, id_ticket ASC
--   LIMIT ?, ?
--
-- The index covers the WHERE filter and ORDER BY so MySQL can
-- serve the query entirely from the index.

SET @old_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_validasi_dashboard'
);

SET @create_ddl := IF(
  @old_exists = 0,
  'CREATE INDEX `idx_ticket_validasi_dashboard` ON `ticket`(`needs_validation`, `status`, `workzone`, `reported_date`)',
  'SELECT 1'
);
PREPARE create_stmt FROM @create_ddl;
EXECUTE create_stmt;
DEALLOCATE PREPARE create_stmt;
