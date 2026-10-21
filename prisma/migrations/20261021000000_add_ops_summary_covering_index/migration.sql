-- Covering index untuk Operations Summary + ringkasan tabel tiket
-- (countStatusesAndCustomerTypes).
--
-- Masalah: filter harian workboard berbentuk OR
--   (status NOT IN ('CLOSED',...) OR (status IN (...) AND closed_at >= hari ini))
-- Tanpa index yang cocok, MySQL memilih full table scan ±830k baris. Pada
-- production (cold buffer pool) query agregat ini sempat 12.9 detik.
--
-- Dengan index ini cabang "aktif" menjadi covering index range scan ±78k
-- entri (terukur 85-150 ms untuk GROUP BY b2c/b2b, 38 ms untuk kartu fokus,
-- 48 ms untuk ringkasan status). Kolom customer_segment ikut karena filter
-- dept b2c/b2b memakainya.
--
-- ALGORITHM=INPLACE, LOCK=NONE: tidak memblokir INSERT/UPDATE ingestion.

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket'
    AND index_name = 'idx_ticket_ops_summary'
);

SET @stmt := IF(@index_exists = 0,
  'ALTER TABLE ticket ADD INDEX idx_ticket_ops_summary (status, customer_type, status_update, jenis_tiket_2, customer_segment, jenis_tiket_1, guarantee_status, ticket_id_gamas, flagging_manja), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);

PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
