-- CreateTable
CREATE TABLE `area` (
    `id_area` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_area` VARCHAR(100) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id_area`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id_role` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id_role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_area` (
    `id_sa` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_sa` VARCHAR(100) NULL,
    `area_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `id_area`(`area_id`),
    PRIMARY KEY (`id_sa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket` (
    `id_ticket` INTEGER NOT NULL AUTO_INCREMENT,
    `INCIDENT` VARCHAR(100) NOT NULL,
    `SUMMARY` VARCHAR(250) NULL,
    `REPORTED_DATE` VARCHAR(100) NULL,
    `OWNER_GROUP` VARCHAR(50) NULL,
    `CUSTOMER_SEGMENT` VARCHAR(100) NULL,
    `SERVICE_TYPE` VARCHAR(50) NULL,
    `WORKZONE` VARCHAR(100) NULL,
    `STATUS` VARCHAR(100) NULL,
    `TICKET_ID_GAMAS` VARCHAR(100) NULL,
    `CONTACT_PHONE` VARCHAR(16) NULL,
    `CONTACT_NAME` VARCHAR(100) NULL,
    `BOOKING_DATE` VARCHAR(100) NULL,
    `SOURCE_TICKET` VARCHAR(100) NULL,
    `CUSTOMER_TYPE` VARCHAR(100) NULL,
    `SERVICE_NO` VARCHAR(100) NULL,
    `SYMPTOM` VARCHAR(100) NULL,
    `DESCRIPTION_ACTUAL_SOLUTION` VARCHAR(100) NULL,
    `DEVICE_NAME` VARCHAR(100) NULL,
    `HASIL_VISIT` VARCHAR(100) NOT NULL DEFAULT 'OPEN',
    `JAM_EXPIRED_12_JAM_GOLD` VARCHAR(255) NULL,
    `STATUS_TTR_12_GOLD` VARCHAR(255) NULL,
    `JAM_EXPIRED_3_JAM_DIAMOND` VARCHAR(255) NULL,
    `STATUS_TTR_3_DIAMOND` VARCHAR(255) NULL,
    `JAM_EXPIRED_24_JAM_REGULER` VARCHAR(255) NULL,
    `STATUS_TTR_24_REGULER` VARCHAR(255) NULL,
    `JAM_EXPIRED_6_JAM_PLATINUM` VARCHAR(255) NULL,
    `STATUS_TTR_6_PLATINUM` VARCHAR(100) NULL,
    `JENIS_TIKET` VARCHAR(255) NULL,
    `JAM_EXPIRED` VARCHAR(255) NULL,
    `REDAMAN` VARCHAR(255) NULL,
    `MANJA_EXPIRED` VARCHAR(255) NULL,
    `ALAMAT` VARCHAR(255) NULL,
    `rca` VARCHAR(100) NULL,
    `sub_rca` VARCHAR(100) NULL,
    `teknisi_user_id` INTEGER NULL,
    `closed_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `INCIDENT`(`INCIDENT`),
    INDEX `fk_ticket_user`(`teknisi_user_id`),
    PRIMARY KEY (`id_ticket`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_assign_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `history_teknisi_user_id` INTEGER NOT NULL,
    `assigned_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_assign_teknisi`(`history_teknisi_user_id`),
    INDEX `fk_assign_ticket`(`ticket_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_evidence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `incident` VARCHAR(100) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NULL,
    `mime_type` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_incident`(`incident`),
    INDEX `idx_ticket_id`(`ticket_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `sa_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NULL,
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `sa_id`(`sa_id`),
    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id_user` INTEGER NOT NULL AUTO_INCREMENT,
    `nik` VARCHAR(50) NULL,
    `nama` VARCHAR(100) NULL,
    `jabatan` VARCHAR(100) NULL,
    `username` VARCHAR(50) NULL,
    `password` VARCHAR(255) NULL,
    `role_id` INTEGER NULL,
    `area_id` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `nik`(`nik`),
    UNIQUE INDEX `username`(`username`),
    INDEX `id_area`(`area_id`),
    INDEX `id_role`(`role_id`),
    PRIMARY KEY (`id_user`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_area` ADD CONSTRAINT `service_area_ibfk_1` FOREIGN KEY (`area_id`) REFERENCES `area`(`id_area`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ticket` ADD CONSTRAINT `fk_ticket_user` FOREIGN KEY (`teknisi_user_id`) REFERENCES `users`(`id_user`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ticket_assign_history` ADD CONSTRAINT `fk_assign_teknisi` FOREIGN KEY (`history_teknisi_user_id`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_assign_history` ADD CONSTRAINT `fk_assign_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_evidence` ADD CONSTRAINT `fk_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_sa` ADD CONSTRAINT `user_sa_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_user`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_sa` ADD CONSTRAINT `user_sa_ibfk_2` FOREIGN KEY (`sa_id`) REFERENCES `service_area`(`id_sa`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`area_id`) REFERENCES `area`(`id_area`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_3` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id_role`) ON DELETE RESTRICT ON UPDATE RESTRICT;
