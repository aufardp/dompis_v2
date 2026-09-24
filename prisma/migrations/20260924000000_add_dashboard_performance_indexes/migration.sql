-- Index untuk dashboard performance (mengatasi MySQL 3024 MAX_EXECUTION_TIME)
--
-- Latar belakang: 4 query dashboard (TTR compliance, SQM daily trend,
-- assurance guarantee, hourly-tickets) full-scan 957k rows → timeout 30s.
--
-- Perubahan query di app/api/dashboard/ + app/libs/services/dashboard-overview.ts
-- sudah bikin predicate sargable (OR-branch, reported_date_dt, GROUP BY di SQL).
-- Index ini memastikan MySQL pakai range scan, bukan table scan.
--
-- Semua ADD INDEX: ALGORITHM=INPLACE, LOCK=NONE (tidak memblokir DML).
-- Karena tabel `ticket` punya FULLTEXT index, ALTER COLUMN lain perlu COPY;
-- tapi ADD INDEX bisa INSTANT (hanya metadata change).
--
-- NOTE: idx_ticket_resolve_closed, idx_ticket_reported_dt_bucket,
-- idx_ticket_service_reported sudah dibuat manual di production.

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_resolve_closed'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_resolve_closed (resolve_date, closed_at), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_reported_dt_bucket'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_reported_dt_bucket (reported_date_dt, operational_bucket), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_service_reported'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_service_reported (service_no, reported_date), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_hourly_ops'
);
SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_hourly_ops (workzone, reported_date, reported_date_dt), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;