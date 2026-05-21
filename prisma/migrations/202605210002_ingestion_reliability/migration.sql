CREATE TABLE IF NOT EXISTS `ingestion_checkpoint` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tableName` VARCHAR(100) NOT NULL,
  `cursorStrategy` VARCHAR(30) NOT NULL DEFAULT 'snapshot',
  `idColumn` VARCHAR(100) NULL DEFAULT NULL,
  `modifiedColumn` VARCHAR(100) NULL DEFAULT NULL,
  `lastCursorId` VARCHAR(191) NULL DEFAULT NULL,
  `lastModifiedAt` TIMESTAMP NULL DEFAULT NULL,
  `lastSuccessfulBatchId` VARCHAR(50) NULL DEFAULT NULL,
  `lastStartedAt` TIMESTAMP NULL DEFAULT NULL,
  `lastFinishedAt` TIMESTAMP NULL DEFAULT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'idle',
  `processedCount` INT NOT NULL DEFAULT 0,
  `insertedCount` INT NOT NULL DEFAULT 0,
  `updatedCount` INT NOT NULL DEFAULT 0,
  `skippedCount` INT NOT NULL DEFAULT 0,
  `failedCount` INT NOT NULL DEFAULT 0,
  `quarantinedCount` INT NOT NULL DEFAULT 0,
  `retriedCount` INT NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ingestion_checkpoint_tableName_key` (`tableName`),
  KEY `ingestion_checkpoint_status_idx` (`status`),
  KEY `ingestion_checkpoint_lastModifiedAt_lastCursorId_idx` (`lastModifiedAt`, `lastCursorId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ingestion_quarantine` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `sourceTable` VARCHAR(100) NOT NULL,
  `batchId` VARCHAR(50) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `rawPayload` JSON NOT NULL,
  `sourceHash` VARCHAR(64) NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ingestion_quarantine_sourceTable_idx` (`sourceTable`),
  KEY `ingestion_quarantine_batchId_idx` (`batchId`),
  KEY `ingestion_quarantine_sourceHash_idx` (`sourceHash`),
  KEY `ingestion_quarantine_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ingestion_run_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `batchId` VARCHAR(50) NOT NULL,
  `tableName` VARCHAR(100) NOT NULL,
  `mode` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `cursorStrategy` VARCHAR(30) NULL DEFAULT NULL,
  `lastCursorId` VARCHAR(191) NULL DEFAULT NULL,
  `lastModifiedAt` TIMESTAMP NULL DEFAULT NULL,
  `processed` INT NOT NULL DEFAULT 0,
  `inserted` INT NOT NULL DEFAULT 0,
  `updated` INT NOT NULL DEFAULT 0,
  `skipped` INT NOT NULL DEFAULT 0,
  `failed` INT NOT NULL DEFAULT 0,
  `quarantined` INT NOT NULL DEFAULT 0,
  `retried` INT NOT NULL DEFAULT 0,
  `durationMs` INT NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `startedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finishedAt` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ingestion_run_log_batchId_idx` (`batchId`),
  KEY `ingestion_run_log_tableName_idx` (`tableName`),
  KEY `ingestion_run_log_status_idx` (`status`),
  KEY `ingestion_run_log_startedAt_idx` (`startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX `ticket_raw_sourceTable_sourceUpdatedAt_idx`
  ON `ticket_raw` (`sourceTable`, `sourceUpdatedAt`);
CREATE INDEX `ticket_raw_sourceTable_lastSeenAt_idx`
  ON `ticket_raw` (`sourceTable`, `lastSeenAt`);
CREATE INDEX `ticket_raw_sourceTable_syncBatchId_idx`
  ON `ticket_raw` (`sourceTable`, `syncBatchId`);
CREATE INDEX `ticket_raw_importedAt_idx`
  ON `ticket_raw` (`importedAt`);
CREATE INDEX `ticket_raw_lastSeenAt_idx`
  ON `ticket_raw` (`lastSeenAt`);
CREATE INDEX `ticket_raw_sourceUpdatedAt_idx`
  ON `ticket_raw` (`sourceUpdatedAt`);
