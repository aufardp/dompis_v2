-- Fase P0 — War Map: tambah service_location + service_location_history
-- Additive only, tidak menyentuh tabel existing.

-- CreateTable
CREATE TABLE `service_location` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service_no` VARCHAR(100) NOT NULL,
    `customer_name` VARCHAR(255) NULL,
    `alamat` TEXT NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `accuracy_meters` DECIMAL(6, 2) NULL,
    `device_name` VARCHAR(100) NULL,
    `barcode_dc` VARCHAR(150) NULL,
    `workzone` VARCHAR(100) NULL,
    `last_ticket_id` INTEGER NULL,
    `last_teknisi_id` INTEGER NULL,
    `tagged_count` INTEGER NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `service_location_service_no_key`(`service_no`),
    INDEX `service_location_workzone_idx`(`workzone`),
    INDEX `idx_service_location_geo`(`latitude`, `longitude`),
    INDEX `service_location_updated_at_idx`(`updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_location_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service_location_id` INTEGER NOT NULL,
    `ticket_id` INTEGER NOT NULL,
    `incident` VARCHAR(100) NOT NULL,
    `service_no` VARCHAR(100) NOT NULL,
    `customer_name` VARCHAR(255) NULL,
    `alamat` TEXT NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `accuracy_meters` DECIMAL(6, 2) NULL,
    `device_name` VARCHAR(100) NULL,
    `barcode_dc` VARCHAR(150) NULL,
    `workzone` VARCHAR(100) NULL,
    `teknisi_user_id` INTEGER NOT NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'manual_tag',
    `tagged_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `service_location_history_service_location_id_idx`(`service_location_id`),
    INDEX `service_location_history_ticket_id_idx`(`ticket_id`),
    INDEX `idx_slh_service_no_tagged_at`(`service_no`, `tagged_at`),
    INDEX `idx_slh_workzone_tagged_at`(`workzone`, `tagged_at`),
    INDEX `idx_slh_geo`(`latitude`, `longitude`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_location` ADD CONSTRAINT `service_location_last_ticket_id_fkey` FOREIGN KEY (`last_ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_location` ADD CONSTRAINT `service_location_last_teknisi_id_fkey` FOREIGN KEY (`last_teknisi_id`) REFERENCES `users`(`id_user`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_location_history` ADD CONSTRAINT `service_location_history_service_location_id_fkey` FOREIGN KEY (`service_location_id`) REFERENCES `service_location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_location_history` ADD CONSTRAINT `service_location_history_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_location_history` ADD CONSTRAINT `service_location_history_teknisi_user_id_fkey` FOREIGN KEY (`teknisi_user_id`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;