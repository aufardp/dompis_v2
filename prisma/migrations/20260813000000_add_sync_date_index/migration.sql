-- M7 — Index sync_date untuk filter legacy kpi_customer (sync_date = today).
-- Additive only.

CREATE INDEX `idx_ticket_sync_date`
  ON `ticket` (`sync_date`);
