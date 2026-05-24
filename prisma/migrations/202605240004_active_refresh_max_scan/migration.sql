SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'active_refresh_run_log'
    AND COLUMN_NAME = 'maxScan'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `active_refresh_run_log` ADD COLUMN `maxScan` INT NOT NULL DEFAULT 5000 AFTER `batchSize`',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
