-- Dashboard Ticket Query Indexes (Additional)
-- Generated for optimizing slow queries in daily-ticket.service.ts
-- Run after existing indexes analysis

-- Index 1: Classification path + status + reported_date
-- Used by: classification_path filtering with status (dashboard queries)
-- Existing indexes have classification_path at position 5+, need position 1
CREATE INDEX idx_ticket_classif_status_reported 
  ON `ticket` (`classification_path`, `status`, `reported_date`);

-- Index 2: Source ticket + classification path + status + reported_date
-- Used by: complex WHERE with source_ticket + classification_path + status
-- No existing index with source_ticket at position 1 + classification_path
CREATE INDEX idx_ticket_source_classif_status_reported 
  ON `ticket` (`source_ticket`, `classification_path`, `status`, `reported_date`);

-- Index 3: Covering index for COUNT with validation filters
-- Used by: countValidasiTickets and similar queries
-- Existing idx_ticket_validasi_dashboard has different column order
CREATE INDEX idx_ticket_validasi_filters 
  ON `ticket` (`needs_validation`, `classification_path`, `status`, `reported_date`);

-- Index 4: Operational filters
-- Used by: operational bucket queries
-- Need status_update at position 1 for operational bucket filters
CREATE INDEX idx_ticket_operational_filters 
  ON `ticket` (`status_update`, `status`, `reported_date`);

-- Optional: Drop redundant indexes after verifying these work
-- Check with: SELECT * FROM sys.schema_unused_indexes WHERE object_schema = 'dompis_db' AND object_name = 'ticket';
-- DROP INDEX idx_ticket_status_reported ON `ticket`;