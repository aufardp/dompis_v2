-- Create a covering index for the fetchSafetyCandidates query:
--   SELECT ... FROM status_refresh_ticket_state s
--   INNER JOIN ticket_raw tr ON tr.incident = s.incident
--   WHERE s.lastCheckedAt < recheckBefore
--     AND s.sourceTable IN (...)
--     AND (... complex conditions ...)
--   ORDER BY s.lastCheckedAt ASC, tr.id_ticket ASC
--   LIMIT ...
--
-- The index covers: filter (lastCheckedAt, sourceTable), join (incident),
-- and hash comparison (lastSourceHash), all in one scan without table lookups.

CREATE INDEX `idx_status_refresh_safety_covering`
  ON `status_refresh_ticket_state`(`lastCheckedAt`, `incident`, `sourceTable`, `lastSourceHash`);
