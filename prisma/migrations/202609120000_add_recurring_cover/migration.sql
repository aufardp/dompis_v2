-- Covering index untuk recurring-disruption (assurance-guarantee) — self-join 60 hari
-- Self-join: inner SELECT service_no WHERE reported_date >= ? AND workzone IN (?) GROUP BY service_no HAVING COUNT>=2
-- Covering (reported_date, workzone, service_no) agar WHERE + GROUP BY pakai indeks tanpa temp-table
-- Additive, INSTANT (no lock)

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_recurring_cover'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_recurring_cover (reported_date, workzone, service_no), ALGORITHM=INSTANT, LOCK=NONE',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
