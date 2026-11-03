CREATE TABLE `ticket_sync_state` (
  `incident` VARCHAR(50) NOT NULL,
  `rawRevision` BIGINT NOT NULL DEFAULT 0,
  `appliedRevision` BIGINT NOT NULL DEFAULT 0,
  `projectionVersion` INTEGER NOT NULL DEFAULT 0,
  `pending` BOOLEAN NOT NULL DEFAULT FALSE,
  `pendingSince` DATETIME(3) NULL,
  `nextAttemptAt` DATETIME(3) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `manualReopenHash` VARCHAR(64) NULL,
  `effectsRevision` BIGINT NOT NULL DEFAULT 0,
  `effectsApplied` BIGINT NOT NULL DEFAULT 0,
  `effectsPending` BOOLEAN NOT NULL DEFAULT FALSE,
  `observedAt` DATETIME(3) NULL,
  `projectedAt` DATETIME(3) NULL,
  PRIMARY KEY (`incident`),
  INDEX `idx_sync_pending` (`pending`, `nextAttemptAt`, `incident`),
  INDEX `idx_sync_pending_age` (`pending`, `pendingSince`, `incident`),
  INDEX `idx_sync_effects` (`effectsPending`, `incident`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ticket_source_snapshot` (
  `incident` VARCHAR(50) NOT NULL,
  `sourceFamily` VARCHAR(50) NOT NULL,
  `resource` VARCHAR(50) NOT NULL,
  `sourceHash` VARCHAR(64) NOT NULL,
  `sourceUpdatedAt` DATETIME(3) NULL,
  `payload` JSON NOT NULL,
  `observedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`incident`, `sourceFamily`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
