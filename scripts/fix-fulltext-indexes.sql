-- Fix FULLTEXT Indexes: Create 3 separate FULLTEXT indexes (not composite)
-- Run this first to fix "Can't find FULLTEXT index matching the column list" error

-- Drop existing composite FULLTEXT index first
DROP INDEX `idx_ticket_jenis_fulltext` ON `ticket`;

-- Create 3 separate FULLTEXT indexes (one per column)
-- This allows MATCH(jenis_tiket_1) AGAINST(...), MATCH(jenis_tiket_2) AGAINST(...), MATCH(symptom) AGAINST(...)
ALTER TABLE `ticket` 
  ADD FULLTEXT INDEX `idx_ticket_jenis_tiket_1_ft` (`jenis_tiket_1`),
  ADD FULLTEXT INDEX `idx_ticket_jenis_tiket_2_ft` (`jenis_tiket_2`),
  ADD FULLTEXT INDEX `idx_ticket_symptom_ft` (`symptom`);

-- Verify
SHOW INDEX FROM `ticket` WHERE Index_type = 'FULLTEXT';