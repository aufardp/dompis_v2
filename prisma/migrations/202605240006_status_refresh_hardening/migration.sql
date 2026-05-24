SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'status_refresh_ticket_state'
    AND column_name = 'lastStatus'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `status_refresh_ticket_state` ADD COLUMN `lastStatus` VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'status_refresh_ticket_state'
    AND column_name = 'lastSourceHash'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `status_refresh_ticket_state` ADD COLUMN `lastSourceHash` VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'status_refresh_ticket_state'
    AND column_name = 'lastBatchId'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `status_refresh_ticket_state` ADD COLUMN `lastBatchId` VARCHAR(100) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'status_refresh_ticket_state'
    AND column_name = 'missingCount'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `status_refresh_ticket_state` ADD COLUMN `missingCount` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'status_refresh_ticket_state'
    AND column_name = 'updatedAt'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `status_refresh_ticket_state` ADD COLUMN `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ticket_raw'
    AND index_name = 'idx_ticket_raw_status_refresh'
);
SET @ddl := IF(
  @index_exists = 0,
  'CREATE INDEX `idx_ticket_raw_status_refresh` ON `ticket_raw`(`isActive`, `status`, `synced_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
