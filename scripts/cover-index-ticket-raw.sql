-- ============================================================
-- Patch: Optimasi Index ticket_raw
-- Eksekusi berurutan — CREATE dulu baru DROP
-- ============================================================

-- 1. Covering index untuk SELECT lookup di processBatch()
--    Query: SELECT incident, sourceHash, status, syncVersion, sourceUpdatedAt
--           FROM ticket_raw WHERE incident IN (...)
--    Dengan index ini, query dipenuhi dari index saja (zero table lookup)
CREATE INDEX idx_ticket_raw_lookup
ON ticket_raw (incident, sourceHash, status, syncVersion, sourceUpdatedAt)
ALGORITHM=INPLACE LOCK=NONE;

-- 2. Drop index redundan — sudah tercover oleh idx_ticket_raw_active_cursor
--    (importedAt, id_ticket) adalah subset dari (isActive, importedAt, id_ticket)
DROP INDEX `idx_ticket_raw_projection_cursor` ON ticket_raw;

-- 3. Drop index legacy — tidak ada query produksi yang menggunakan
--    customer_id + service_no + reported_date sebagai filter
DROP INDEX `ticket_raw_customer_id_service_no_reported_date_idx` ON ticket_raw;

-- 4. Drop index sourceHash tunggal — sudah tercover oleh idx_ticket_raw_lookup
--    sourceHash hanya muncul sebagai SELECT, bukan di WHERE/JOIN
DROP INDEX `ticket_raw_sourceHash_idx` ON ticket_raw;

-- 5. Drop index (sourceTable, incident) — incident sudah unique key,
--    query WHERE sourceTable= ? sudah dilayani oleh idx_ticket_raw_source_updated
DROP INDEX `ticket_raw_sourceTable_incident_idx` ON ticket_raw;

-- 6. Update statistik agar optimizer MySQL pakai index baru dengan benar
ANALYZE TABLE ticket_raw;
