-- Additive indexes for daily operational and validation ticket queries.
-- These indexes are intentionally narrow and do not change data.

CREATE INDEX `idx_ticket_daily_sync_status_reported`
ON `ticket` (`sync_date`, `status`, `reported_date`);

CREATE INDEX `idx_ticket_validasi_status_reported`
ON `ticket` (`status_update`, `status`, `reported_date`);

CREATE INDEX `idx_ticket_validasi_worklog_reported`
ON `ticket` (`worklog_summary`, `status`, `reported_date`);
