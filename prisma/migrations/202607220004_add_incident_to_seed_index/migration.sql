-- Add `incident` to the status refresh seed covering index
--
-- The seed query filters on `incident IS NOT NULL` but the previous
-- index idx_ticket_raw_status_refresh_seed_v2 did NOT include incident.
-- MySQL had to do a clustered-index lookup for every candidate row to
-- check the incident column. Adding incident makes the index a true
-- covering index — no table lookups needed.
--
-- Seed query pattern:
--   WHERE isActive = true
--     AND incident IS NOT NULL
--     AND sourceTable IN (...)
--     AND sourceUpdatedAt < hotWindowStart
--   ORDER BY sourceUpdatedAt DESC, id_ticket ASC
--   LIMIT 500
--   SELECT incident, sourceTable, status, sourceHash
--
-- The index name remains the same (_v2) since this is a silent upgrade
-- (same name, more columns). We drop and recreate atomically.

DROP INDEX `idx_ticket_raw_status_refresh_seed_v2` ON `ticket_raw`;

CREATE INDEX `idx_ticket_raw_status_refresh_seed_v2`
  ON `ticket_raw`(`isActive`, `incident`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC, `status`, `sourceHash`);
