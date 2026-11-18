-- Dua index ini cuma ada di `schema.prisma`, belum pernah masuk migration, jadi
-- database baru (shadow DB, staging, DR) tidak akan membuatnya. Guard di bawah
-- membuat migration tetap aman kalau production sudah punya index-nya.
--
-- `ticket` sudah punya 33 index sekunder, jadi cek pemakaian sebelum menambah
-- yang lain:
--   SELECT index_name, count_star, count_read
--   FROM performance_schema.table_io_waits_summary_by_index_usage
--   WHERE object_schema = DATABASE() AND object_name = 'ticket'
--     AND index_name IS NOT NULL;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_wz_cp_st_stu'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_wz_cp_st_stu (workzone, classification_path, status, status_update), ALGORITHM=INPLACE, LOCK=NONE',
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
    AND index_name = 'idx_ticket_reported_wz_st'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_reported_wz_st (reported_date, workzone, status), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);

PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
