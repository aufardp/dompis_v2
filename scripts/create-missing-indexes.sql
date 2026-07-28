-- Buat index yang belum ada di database VPS
-- Schema index sudah ada di prisma/schema.prisma tapi belum di-create
-- Jalankan via MySQL CLI (bukan phpMyAdmin) agar tidak timeout

ALTER TABLE ticket_raw ADD INDEX idx_ticket_raw_lookup (incident, sourceHash, status, syncVersion, sourceUpdatedAt);
ALTER TABLE ticket_raw ADD INDEX idx_ticket_raw_refresh_join (incident, isActive, sourceTable, status, sourceUpdatedAt, sourceHash);
ALTER TABLE ticket_raw ADD INDEX idx_ticket_raw_imported_incident (importedAt, incident);
ALTER TABLE ticket_raw ADD INDEX idx_ticket_raw_active_source_updated_incident (isActive, sourceTable, sourceUpdatedAt, incident);
ALTER TABLE status_refresh_ticket_state ADD INDEX idx_status_refresh_safety_covering (lastCheckedAt, incident, sourceTable, lastSourceHash);
