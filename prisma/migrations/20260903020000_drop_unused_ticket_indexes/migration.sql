-- Drop 7 unused secondary indexes on `ticket`.
--
-- Evidence: performance_schema.table_io_waits_summary_by_index_usage on prod
-- (uptime > 1 day) reported count_star = 0 for every index below — never used
-- for a read since the last MySQL restart, across a full daily cycle
-- (ingestion every minute + constant dashboard traffic).
--
--   idx_ticket_bucket                    superseded by idx_ticket_bucket_v2 (386M reads)
--   idx_ticket_daily_board               6-col composite, 0 reads
--   idx_ticket_daily_validasi_workzone   6-col composite, 0 reads
--   idx_ticket_sd_stu_st                 0 reads
--   idx_ticket_customer_segment          0 reads; low selectivity (DCS/PL-TSEL/...)
--   idx_ticket_flagging                  0 reads; flagging_manja is only displayed, never filtered
--   idx_ticket_validasi_worklog_reported 0 reads; validation dashboard uses idx_ticket_validasi_status_reported (93M reads)
--
-- Goal: cut secondary-index maintenance work per INSERT/UPDATE on `ticket`
-- (~50 indexes today) to reduce write amplification and InnoDB lock surface.
--
-- The first 4 indexes were added directly on prod and are NOT declared in
-- schema.prisma, so a fresh/shadow DB does not have them. Each DROP is guarded
-- against a missing index so this migration is safe to replay on any DB.

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_bucket') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_bucket`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_daily_board') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_daily_board`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_daily_validasi_workzone') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_daily_validasi_workzone`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_sd_stu_st') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_sd_stu_st`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_customer_segment') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_customer_segment`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_flagging') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_flagging`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'ticket'
     AND index_name = 'idx_ticket_validasi_worklog_reported') > 0,
  'ALTER TABLE `ticket` DROP INDEX `idx_ticket_validasi_worklog_reported`, ALGORITHM=INPLACE, LOCK=NONE',
  'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
