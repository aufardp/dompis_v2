-- ============================================================
-- PERMANENT FIX FOR DOMPS TICKET TABLE PERFORMANCE ISSUES
-- Run this on the MySQL server (requires ALTER TABLE privileges)
-- ============================================================

-- ============================================================
-- PHASE 1: FIX FULLTEXT INDEXES (Fix Error 1191)
-- ============================================================
-- The current composite FULLTEXT index doesn't work with single-column MATCH() queries
-- Need 3 separate FULLTEXT indexes for single-column MATCH() queries

-- Drop existing composite FULLTEXT index
DROP INDEX `idx_ticket_jenis_fulltext` ON `ticket`;

-- Create 3 separate FULLTEXT indexes for single-column MATCH() queries
-- This fixes "Can't find FULLTEXT index matching the column list" (Error 1191)
ALTER TABLE `ticket` 
  ADD FULLTEXT INDEX `idx_ticket_jenis_tiket_1_ft` (`jenis_tiket_1`),
  ADD FULLTEXT INDEX `idx_ticket_jenis_tiket_2_ft` (`jenis_tiket_2`),
  ADD FULLTEXT INDEX `idx_ticket_symptom_ft` (`symptom`);

-- Verify FULLTEXT indexes
SHOW INDEX FROM `ticket` WHERE Index_type = 'FULLTEXT';

-- ============================================================
-- PHASE 2: CREATE 4 NEW BTREE INDEXES FOR DASHBOARD QUERIES
-- ============================================================
-- These indexes optimize the slow dashboard queries that were timing out

-- Index 1: Classification path + status + reported_date
-- Used by: classification_path filtering with status (dashboard queries)
-- Existing indexes have classification_path at position 5+, need position 1
CREATE INDEX `idx_ticket_classif_status_reported` 
  ON `ticket` (`classification_path`, `status`, `reported_date`);

-- Index 2: Source ticket + classification path + status + reported_date
-- Used by: complex WHERE with source_ticket + classification_path + status
-- No existing index with source_ticket at position 1 + classification_path
CREATE INDEX `idx_ticket_source_classif_status_reported` 
  ON `ticket` (`source_ticket`, `classification_path`, `status`, `reported_date`);

-- Index 3: Validasi filters (different order from existing idx_ticket_validasi_dashboard)
-- Used by: countValidasiTickets and similar queries
-- Existing idx_ticket_validasi_dashboard has different column order
CREATE INDEX `idx_ticket_validasi_filters` 
  ON `ticket` (`needs_validation`, `classification_path`, `status`, `reported_date`);

-- Index 4: Operational filters
-- Used by: operational bucket queries
-- Need status_update at position 1 for operational bucket filters
CREATE INDEX `idx_ticket_operational_filters` 
  ON `ticket` (`status_update`, `status`, `reported_date`);

-- Verify BTREE indexes
SHOW INDEX FROM `ticket` WHERE Key_name IN (
  'idx_ticket_classif_status_reported',
  'idx_ticket_source_classif_status_reported',
  'idx_ticket_validasi_filters',
  'idx_ticket_operational_filters'
);

-- ============================================================
-- PHASE 3: SET innodb_lock_wait_timeout = 120 (Permanent)
-- ============================================================
-- This prevents "Lock wait timeout exceeded" (Error 1205) during large UPDATE/DELETE operations
-- Run this in MySQL client, then add to my.cnf for persistence

-- Check current value
-- SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';

-- Set for current session (temporary)
-- SET SESSION innodb_lock_wait_timeout = 120;

-- Set permanently (requires my.cnf edit and MySQL restart):
-- Add to /etc/mysql/mysql.conf.d/mysqld.cnf or /etc/my.cnf:
-- [mysqld]
-- innodb_lock_wait_timeout = 120
-- Then: systemctl restart mysql

-- ============================================================
-- PHASE 4: VERIFY ALL INDEXES
-- ============================================================
-- Run after all indexes are created to verify

SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX,
    INDEX_TYPE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'dompis_db' 
  AND TABLE_NAME = 'ticket'
  AND INDEX_NAME IN (
    'idx_ticket_jenis_tiket_1_ft',
    'idx_ticket_jenis_tiket_2_ft',
    'idx_ticket_symptom_ft',
    'idx_ticket_classif_status_reported',
    'idx_ticket_source_classif_status_reported',
    'idx_ticket_validasi_filters',
    'idx_ticket_operational_filters'
  )
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- ============================================================
-- PHASE 5: OPTIONAL - DROP REDUNDANT INDEXES (After Verification)
-- ============================================================
-- After verifying new indexes work, consider dropping redundant indexes
-- Check with: SELECT * FROM sys.schema_unused_indexes WHERE object_schema = 'dompis_db' AND object_name = 'ticket';
-- Example: DROP INDEX idx_ticket_status_reported ON `ticket`;
-- ============================================================