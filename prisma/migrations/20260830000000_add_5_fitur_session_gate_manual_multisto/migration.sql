-- Session lifetimes are ENV-driven, no DB change for JWT.

-- 1) system_config for attendance gate per segment
CREATE TABLE IF NOT EXISTS `system_config` (
  `key` VARCHAR(100) NOT NULL,
  `value` VARCHAR(500) NOT NULL,
  `updated_by` INT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_config` (`key`, `value`) VALUES
  ('attendance_gate_b2b', 'true'),
  ('attendance_gate_b2c', 'true'),
  ('attendance_gate_unset', 'true')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- 2) technician_attendance: allow multi-STO per day
-- Drop old unique (technician_id, date) if exists, add new (technician_id, date, workzone_id)
-- MySQL: need to know constraint name; Prisma generates `technician_attendance_technician_id_date_key`
ALTER TABLE `technician_attendance` DROP INDEX `technician_attendance_technician_id_date_key`;
ALTER TABLE `technician_attendance` ADD UNIQUE KEY `technician_attendance_technician_id_date_workzone_id_key` (`technician_id`, `date`, `workzone_id`);
CREATE INDEX `idx_attendance_technician_date` ON `technician_attendance` (`technician_id`, `date`);

-- 3) ticket: manual ticket flags
ALTER TABLE `ticket` ADD COLUMN `is_manual` BOOLEAN NOT NULL DEFAULT FALSE AFTER `ttr_deadline_at`;
ALTER TABLE `ticket` ADD COLUMN `manual_category` VARCHAR(50) NULL AFTER `is_manual`;
ALTER TABLE `ticket` ADD COLUMN `manual_notes` TEXT NULL AFTER `manual_category`;
ALTER TABLE `ticket` ADD COLUMN `manual_created_by` INT NULL AFTER `manual_notes`;
CREATE INDEX `idx_ticket_is_manual` ON `ticket` (`is_manual`);
