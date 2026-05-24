CREATE TABLE IF NOT EXISTS `active_refresh_run_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `batchId` VARCHAR(50) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `batchSize` INT NOT NULL DEFAULT 1000,
  `scanned` INT NOT NULL DEFAULT 0,
  `updated` INT NOT NULL DEFAULT 0,
  `durationMs` INT NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `startedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `finishedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `active_refresh_run_log_batchId_key` (`batchId`),
  KEY `active_refresh_run_log_batchId_idx` (`batchId`),
  KEY `active_refresh_run_log_status_idx` (`status`),
  KEY `active_refresh_run_log_startedAt_idx` (`startedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
