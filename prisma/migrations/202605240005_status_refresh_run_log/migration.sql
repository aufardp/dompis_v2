CREATE TABLE `status_refresh_run_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `batchId` VARCHAR(100) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `batchSize` INT NOT NULL DEFAULT 300,
  `scanned` INT NOT NULL DEFAULT 0,
  `fetched` INT NOT NULL DEFAULT 0,
  `changed` INT NOT NULL DEFAULT 0,
  `unchanged` INT NOT NULL DEFAULT 0,
  `missing` INT NOT NULL DEFAULT 0,
  `durationMs` INT NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `startedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `finishedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `status_refresh_run_log_batchId_key`(`batchId`),
  INDEX `status_refresh_run_log_batchId_idx`(`batchId`),
  INDEX `status_refresh_run_log_status_idx`(`status`),
  INDEX `status_refresh_run_log_startedAt_idx`(`startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `status_refresh_ticket_state` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `incident` VARCHAR(50) NOT NULL,
  `sourceTable` VARCHAR(50) NULL,
  `lastCheckedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `lastStatus` VARCHAR(50) NULL,
  `lastSourceHash` VARCHAR(64) NULL,
  `lastBatchId` VARCHAR(100) NULL,
  `missingCount` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `status_refresh_ticket_state_incident_key`(`incident`),
  INDEX `status_refresh_ticket_state_lastCheckedAt_idx`(`lastCheckedAt`),
  INDEX `status_refresh_ticket_state_sourceTable_lastCheckedAt_idx`(`sourceTable`, `lastCheckedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
