-- Fase 1 — Import KML Layer: tambah kml_layer + kml_sublayer + kml_feature
-- Additive only, tidak menyentuh tabel existing.

-- CreateTable
CREATE TABLE `kml_layer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `file_size_bytes` INTEGER NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `workzone_tag` VARCHAR(100) NULL,
    `point_count` INTEGER NOT NULL DEFAULT 0,
    `line_count` INTEGER NOT NULL DEFAULT 0,
    `bbox_south` DECIMAL(10, 7) NULL,
    `bbox_west` DECIMAL(10, 7) NULL,
    `bbox_north` DECIMAL(10, 7) NULL,
    `bbox_east` DECIMAL(10, 7) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `uploaded_by` INTEGER NOT NULL,
    `uploaded_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `kml_layer_status_idx`(`status`),
    INDEX `kml_layer_workzone_tag_idx`(`workzone_tag`),
    INDEX `kml_layer_uploaded_by_fkey`(`uploaded_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kml_sublayer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kml_layer_id` INTEGER NOT NULL,
    `folder_path` VARCHAR(300) NOT NULL,
    `geometry_kind` VARCHAR(10) NOT NULL,
    `feature_count` INTEGER NOT NULL DEFAULT 0,
    `default_visible` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `kml_sublayer_kml_layer_id_fkey`(`kml_layer_id`),
    UNIQUE INDEX `kml_sublayer_kml_layer_id_folder_path_key`(`kml_layer_id`, `folder_path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kml_feature` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kml_layer_id` INTEGER NOT NULL,
    `kml_sublayer_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `feature_type` VARCHAR(10) NOT NULL,
    `folder_path` VARCHAR(300) NOT NULL,
    `description_raw` TEXT NULL,
    `parsed_metadata` JSON NULL,
    `style_color` VARCHAR(20) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `path_coordinates` JSON NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `kml_feature_kml_layer_id_idx`(`kml_layer_id`),
    INDEX `kml_feature_kml_sublayer_id_idx`(`kml_sublayer_id`),
    INDEX `idx_kml_feature_geo`(`latitude`, `longitude`),
    INDEX `kml_feature_kml_layer_id_fkey`(`kml_layer_id`),
    INDEX `kml_feature_kml_sublayer_id_fkey`(`kml_sublayer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kml_layer` ADD CONSTRAINT `kml_layer_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kml_sublayer` ADD CONSTRAINT `kml_sublayer_kml_layer_id_fkey` FOREIGN KEY (`kml_layer_id`) REFERENCES `kml_layer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kml_feature` ADD CONSTRAINT `kml_feature_kml_layer_id_fkey` FOREIGN KEY (`kml_layer_id`) REFERENCES `kml_layer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kml_feature` ADD CONSTRAINT `kml_feature_kml_sublayer_id_fkey` FOREIGN KEY (`kml_sublayer_id`) REFERENCES `kml_sublayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
