CREATE TABLE IF NOT EXISTS `ticket_projection_checkpoint` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `lastProjectedImportedAt` TIMESTAMP NULL DEFAULT NULL,
  `lastProjectedTicketRawId` VARCHAR(36) NULL DEFAULT NULL,
  `lastSyncBatchId` VARCHAR(50) NULL DEFAULT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'idle',
  `processed` INT NOT NULL DEFAULT 0,
  `inserted` INT NOT NULL DEFAULT 0,
  `updated` INT NOT NULL DEFAULT 0,
  `skipped` INT NOT NULL DEFAULT 0,
  `failed` INT NOT NULL DEFAULT 0,
  `retried` INT NOT NULL DEFAULT 0,
  `protected` INT NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `startedAt` TIMESTAMP NULL DEFAULT NULL,
  `completedAt` TIMESTAMP NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_projection_checkpoint_name_key` (`name`),
  KEY `ticket_projection_checkpoint_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_projection_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ticketRawId` VARCHAR(36) NOT NULL,
  `incident` VARCHAR(100) NOT NULL,
  `syncBatchId` VARCHAR(50) NULL DEFAULT NULL,
  `importedAt` TIMESTAMP NULL DEFAULT NULL,
  `action` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 1,
  `sourceHash` VARCHAR(64) NULL DEFAULT NULL,
  `syncVersion` INT NULL DEFAULT NULL,
  `error` TEXT NULL,
  `projectedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_projection_log_ticketRawId_key` (`ticketRawId`),
  KEY `ticket_projection_log_incident_idx` (`incident`),
  KEY `ticket_projection_log_status_idx` (`status`),
  KEY `ticket_projection_log_syncBatchId_idx` (`syncBatchId`),
  KEY `ticket_projection_log_importedAt_ticketRawId_idx` (`importedAt`, `ticketRawId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX `ticket_raw_projection_cursor_idx`
  ON `ticket_raw` (`isActive`, `importedAt`, `id_ticket`);
