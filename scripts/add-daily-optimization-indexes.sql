-- Index tambahan untuk optimasi dashboard daily ticket (Layer 2 - v3)
--
-- Masalah v2: index ASC biasa (reported_date, id_ticket, ...) TIDAK bisa memenuhi
-- ORDER BY reported_date DESC, id_ticket ASC (mixed-direction). Backward index scan
-- menghasilkan id_ticket DESC dalam grup, bukan ASC -> MySQL tetap filesort.
--
-- Solusi: descending index. ORDER BY mixed-direction hanya bisa dipenuhi index
-- jika index mendeklarasikan arah kolom yang sama (MySQL 8.0.13+). Produksi = 8.0.45.
--
-- Dengan index (reported_date DESC, id_ticket ASC, status_update, status):
--   - forward index scan sudah dalam urutan ORDER BY -> tidak ada filesort
--   - LIMIT 15 pushdown -> early exit setelah 15 row lolos filter status
--   - status/status_update ada di index -> covering index (tanpa lookup ke tabel)
--
-- Jalankan SEBELUM deploy. Verifikasi:
--   EXPLAIN ANALYZE SELECT id_ticket, reported_date FROM ticket
--     WHERE status NOT IN ('CLOSED','CLOSE','FINALCHECK','MEDIACARE','SALAMSIM','RESOLVED')
--     ORDER BY reported_date DESC, id_ticket ASC LIMIT 15;
--   -> harus: Limit -> Index scan on idx_ticket_reported_status_update (Forward),
--      TANPA Sort. Perhatikan di SHOW INDEX kolom reported_date akan Collation 'D'.

DROP PROCEDURE IF EXISTS add_daily_optimization_indexes;
DELIMITER $$
CREATE PROCEDURE add_daily_optimization_indexes()
BEGIN
    DECLARE has_idx INT;

    -- A) Index utama: urutan ORDER BY reported_date DESC, id_ticket ASC
    SELECT COUNT(*) INTO has_idx
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_reported_status_update';
    IF has_idx > 0 THEN
        ALTER TABLE `ticket` DROP INDEX `idx_ticket_reported_status_update`;
    END IF;

    ALTER TABLE `ticket`
      ADD INDEX `idx_ticket_reported_status_update`
        (`reported_date` DESC, `id_ticket` ASC, `status_update`, `status`);

    -- B) Path source_ticket + ORDER BY reported_date (validasi / proaktif)
    SELECT COUNT(*) INTO has_idx
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_source_reported';
    IF has_idx = 0 THEN
        ALTER TABLE `ticket`
          ADD INDEX `idx_ticket_source_reported`
            (`source_ticket`, `reported_date`, `id_ticket`);
    END IF;
END$$
DELIMITER ;

CALL add_daily_optimization_indexes();
DROP PROCEDURE add_daily_optimization_indexes;
