-- Drop redundant indexes on ticket_raw
--
-- These indexes were added by previous migrations but are now covered
-- by more composite (covering) indexes declared in schema.prisma.
-- Dropping them reduces INSERT overhead (fewer B-tree updates per write).
--
-- Indexes dropped:
--   1. ticket_raw_importedAt_idx          → covered by idx_ticket_raw_imported_incident (importedAt, incident)
--   2. ticket_raw_lastSeenAt_idx          → covered by @@index([isActive, lastSeenAt])
--   3. ticket_raw_sourceUpdatedAt_idx     → covered by @@index([sourceTable, sourceUpdatedAt])
--   4. idx_ticket_raw_active_source_incident → covered by idx_ticket_raw_active_source_updated_incident
--   5. ticket_raw_sourceTable_lastSeenAt_idx → covered by idx_ticket_raw_status_refresh_nulls
--   6. idx_ticket_raw_projection_cursor   → covered by idx_ticket_raw_active_cursor (isActive, importedAt, id_ticket)
--   7. ticket_raw_sourceTable_syncBatchId_idx → covered by idx_ticket_raw_projection_batch_cursor (syncBatchId, importedAt, id_ticket)
--   8. ticket_raw_projection_cursor_idx   → DUPLICATE of idx_ticket_raw_active_cursor (same columns, different name)

DROP INDEX `ticket_raw_importedAt_idx` ON `ticket_raw`;
DROP INDEX `ticket_raw_lastSeenAt_idx` ON `ticket_raw`;
DROP INDEX `ticket_raw_sourceUpdatedAt_idx` ON `ticket_raw`;
DROP INDEX `idx_ticket_raw_active_source_incident` ON `ticket_raw`;
DROP INDEX `ticket_raw_sourceTable_lastSeenAt_idx` ON `ticket_raw`;
DROP INDEX `idx_ticket_raw_projection_cursor` ON `ticket_raw`;
DROP INDEX `ticket_raw_sourceTable_syncBatchId_idx` ON `ticket_raw`;
