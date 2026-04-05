-- AlterTable to add clusters relation to service_area
ALTER TABLE `service_area` ADD COLUMN `clusters` JSON NULL;

-- CreateTable: cluster
CREATE TABLE `cluster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sa_id` INTEGER NOT NULL,
    `nama_cluster` VARCHAR(100) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `cluster_sa_id_nama_cluster_key` (`sa_id`, `nama_cluster`),
    INDEX `cluster_sa_id_is_active_idx` (`sa_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: cluster_area
CREATE TABLE `cluster_area` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cluster_id` INTEGER NOT NULL,
    `nama_area` VARCHAR(150) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `cluster_area_cluster_id_idx` (`cluster_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: cluster_node
CREATE TABLE `cluster_node` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cluster_id` INTEGER NOT NULL,
    `cluster_area_id` INTEGER NULL,
    `odc_value` VARCHAR(100) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `cluster_node_odc_value_key` (`odc_value`),
    INDEX `cluster_node_cluster_id_idx` (`cluster_id`),
    INDEX `cluster_node_odc_value_idx` (`odc_value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: cluster_assignment
CREATE TABLE `cluster_assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cluster_id` INTEGER NOT NULL,
    `teknisi_id` INTEGER NOT NULL,
    `assigned_date` VARCHAR(10) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `assigned_by` INTEGER NOT NULL,
    `note` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `cluster_assignment_cluster_id_teknisi_id_assigned_date_key` (`cluster_id`, `teknisi_id`, `assigned_date`),
    INDEX `cluster_assignment_assigned_date_cluster_id_idx` (`assigned_date`, `cluster_id`),
    INDEX `cluster_assignment_teknisi_id_assigned_date_idx` (`teknisi_id`, `assigned_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: cluster
ALTER TABLE `cluster` ADD CONSTRAINT `cluster_service_area_fk` FOREIGN KEY (`sa_id`) REFERENCES `service_area`(`id_sa`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `cluster` ADD CONSTRAINT `cluster_creator_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id_user`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: cluster_area
ALTER TABLE `cluster_area` ADD CONSTRAINT `cluster_area_cluster_fk` FOREIGN KEY (`cluster_id`) REFERENCES `cluster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: cluster_node
ALTER TABLE `cluster_node` ADD CONSTRAINT `cluster_node_cluster_fk` FOREIGN KEY (`cluster_id`) REFERENCES `cluster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `cluster_node` ADD CONSTRAINT `cluster_node_cluster_area_fk` FOREIGN KEY (`cluster_area_id`) REFERENCES `cluster_area`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: cluster_assignment
ALTER TABLE `cluster_assignment` ADD CONSTRAINT `cluster_assignment_cluster_fk` FOREIGN KEY (`cluster_id`) REFERENCES `cluster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `cluster_assignment` ADD CONSTRAINT `cluster_assignment_teknisi_fk` FOREIGN KEY (`teknisi_id`) REFERENCES `users`(`id_user`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `cluster_assignment` ADD CONSTRAINT `cluster_assignment_assigner_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id_user`) ON DELETE CASCADE ON UPDATE CASCADE;
