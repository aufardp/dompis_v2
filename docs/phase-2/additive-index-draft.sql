-- Draft additive indexes for Phase 2.
-- Jangan apply langsung ke production tanpa EXPLAIN dan window maintenance yang aman.

-- ticket
CREATE INDEX idx_ticket_daily_board
  ON ticket (sync_date, workzone, status, reported_date, id_ticket);

CREATE INDEX idx_ticket_daily_validasi
  ON ticket (sync_date, workzone, status_update, status, reported_date, id_ticket);

CREATE INDEX idx_ticket_sync_workzone_statusupdate
  ON ticket (sync_date, workzone, status_update);

-- ticket_raw
CREATE INDEX idx_ticket_raw_active_source_incident
  ON ticket_raw (isActive, sourceTable, incident);

CREATE INDEX idx_ticket_raw_active_source_updated_incident
  ON ticket_raw (isActive, sourceTable, sourceUpdatedAt, incident);

-- projection log
CREATE INDEX idx_ticket_projection_log_status_imported
  ON ticket_projection_log (status, importedAt);

-- tech outbox
CREATE INDEX idx_tech_event_outbox_status_created
  ON tech_event_outbox (status, created_at);
