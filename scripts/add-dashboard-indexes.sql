-- Dashboard Ticket Query Indexes
-- Generated for optimizing slow queries in daily-ticket.service.ts

-- Index 1: Main dashboard query with sync_date + status + reported_date
-- Used by: sync_date filtering with status exclusion
CREATE INDEX idx_ticket_sync_status_reported 
  ON `ticket` (`sync_date`, `status`, `reported_date`);

-- Index 2: Classification path + status + reported_date  
-- Used by: classification_path filtering with status
CREATE INDEX idx_ticket_classif_status_reported 
  ON `ticket` (`classification_path`, `status`, `reported_date`);

-- Index 3: Source ticket + classification path + status + reported_date
-- Used by: complex WHERE with source_ticket + classification_path + status
CREATE INDEX idx_ticket_source_classif_status_reported 
  ON `ticket` (`source_ticket`, `classification_path`, `status`, `reported_date`);

-- Index 4: Status + reported_date (simple)
-- Used by: COUNT(*) with status filtering
CREATE INDEX idx_ticket_status_reported 
  ON `ticket` (`status`, `reported_date`);

-- Index 5: Covering index for COUNT with multiple filters
-- Used by: countValidasiTickets and similar
CREATE INDEX idx_ticket_validasi_filters 
  ON `ticket` (`needs_validation`, `classification_path`, `status`, `reported_date`);

-- Index 6: For operational bucket queries
CREATE INDEX idx_ticket_operational_filters 
  ON `ticket` (`status_update`, `status`, `reported_date`);

-- Index 7: For symptom search (if used)
CREATE INDEX idx_ticket_symptom_status 
  ON `ticket` (`symptom`(100), `status`);