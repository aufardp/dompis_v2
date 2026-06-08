-- AlterTable
ALTER TABLE `ticket_projection_checkpoint`
  ADD COLUMN IF NOT EXISTS `heartbeatAt` TIMESTAMP NULL DEFAULT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS `projection_request` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `source` VARCHAR(100) NOT NULL,
  `sync_batch_id` VARCHAR(100) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `projection_request_processedAt_id_idx` (`processed_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
