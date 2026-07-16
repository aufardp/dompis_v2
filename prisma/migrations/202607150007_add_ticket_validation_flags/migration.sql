-- Add computed validation classification columns to `ticket`.
-- These replace the runtime LIKE '%Tech Closed%' scan with a pre-computed
-- flag that is set once during projection and backed by a B-tree index.
--
-- ALTER TABLE is additive only: no existing columns are modified or dropped.

ALTER TABLE `ticket`
  ADD COLUMN `needs_validation` TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN `validation_reason` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `validation_flagged_at` DATETIME(6) DEFAULT NULL,
  ADD INDEX `idx_ticket_needs_validation` (`needs_validation`);
