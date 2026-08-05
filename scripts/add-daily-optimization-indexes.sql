-- Index tambahan untuk optimasi dashboard daily ticket (Layer 2 - v2)
-- Menunjang query keyset: ORDER BY reported_date + id_ticket + filter status.
--
-- KRITIKAL: index A harus (reported_date, id_ticket, ...) - id_ticket LANGSUNG setelah
-- reported_date agar MySQL bisa backward index scan memenuhi
-- ORDER BY reported_date DESC, id_ticket ASC (dibutuhkan versi MySQL 8+).
-- Versi sebelumnya (reported_date, status_update, status, id_ticket) TIDAK dipakai
-- optimizer karena id_ticket tidak sejajar dengan reported_date.
--
-- Script ini idempotent (aman dijalankan berkali-kali; menangani index v1 yang
-- mungkin sudah pernah dibuat, atau belum dibuat sama sekali).
--
-- Jalankan SEBELUM deploy. Verifikasi:
--   EXPLAIN ANALYZE SELECT id_ticket, reported_date FROM ticket
--     WHERE status NOT IN ('CLOSED','CLOSE','FINALCHECK','MEDIACARE','SALAMSIM','RESOLVED')
--     ORDER BY reported_date DESC, id_ticket ASC LIMIT 15;
--   -> harus pakai index A (Backward index scan) + Limit early, bukan
--      idx_ticket_sync_status_reported + Sort.

DROP PROCEDURE IF EXISTS add_daily_optimization_indexes;
DELIMITER $$
CREATE PROCEDURE add_daily_optimization_indexes()
BEGIN
    DECLARE has_idx INT;

    -- A) Hapus versi v1 yang salah desain (jika ada), lalu tambah versi benar
    SELECT COUNT(*) INTO has_idx
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_reported_status_update';
    IF has_idx > 0 THEN
        ALTER TABLE `ticket` DROP INDEX `idx_ticket_reported_status_update`;
    END IF;

    ALTER TABLE `ticket`
      ADD INDEX `idx_ticket_reported_status_update`
        (`reported_date`, `id_ticket`, `status_update`, `status`);

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