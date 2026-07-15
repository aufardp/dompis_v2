-- Cleanup redundant indexes on ticket_raw
-- idx_ticket_raw_isActive: redundant (composite [isActive, lastSeenAt] covers it)
-- ticket_raw_status_isActive_idx: redundant (idx_ticket_raw_status_refresh [isActive, status, synced_at] covers it)

DROP INDEX `idx_ticket_raw_isActive` ON `ticket_raw`;
DROP INDEX `ticket_raw_status_isActive_idx` ON `ticket_raw`;
