-- Fix FULLTEXT Indexes: Create 3 separate FULLTEXT indexes (not composite)
-- Run this first to fix "Can't find FULLTEXT index matching the column list" error

-- Drop existing composite FULLTEXT index first (guard: only if it exists)
DROP PROCEDURE IF EXISTS fix_fulltext_indexes;
DELIMITER $$
CREATE PROCEDURE fix_fulltext_indexes()
BEGIN
    DECLARE has_composite INT;
    DECLARE has_ft1 INT;
    DECLARE has_ft2 INT;
    DECLARE has_fts INT;

    SELECT COUNT(*) INTO has_composite
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_jenis_fulltext';
    IF has_composite > 0 THEN
        ALTER TABLE `ticket` DROP INDEX `idx_ticket_jenis_fulltext`;
    END IF;

    SELECT COUNT(*) INTO has_ft1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_jenis_tiket_1_ft';
    IF has_ft1 = 0 THEN
        ALTER TABLE `ticket` ADD FULLTEXT INDEX `idx_ticket_jenis_tiket_1_ft` (`jenis_tiket_1`);
    END IF;

    SELECT COUNT(*) INTO has_ft2
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_jenis_tiket_2_ft';
    IF has_ft2 = 0 THEN
        ALTER TABLE `ticket` ADD FULLTEXT INDEX `idx_ticket_jenis_tiket_2_ft` (`jenis_tiket_2`);
    END IF;

    SELECT COUNT(*) INTO has_fts
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ticket'
      AND index_name = 'idx_ticket_symptom_ft';
    IF has_fts = 0 THEN
        ALTER TABLE `ticket` ADD FULLTEXT INDEX `idx_ticket_symptom_ft` (`symptom`);
    END IF;
END$$
DELIMITER ;

CALL fix_fulltext_indexes();
DROP PROCEDURE fix_fulltext_indexes;

-- Verify
SHOW INDEX FROM `ticket` WHERE Index_type = 'FULLTEXT';