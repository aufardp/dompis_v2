-- CreateTable
CREATE TABLE `ticket_tracking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `assigned_by` INTEGER NULL,
    `assigned_to` INTEGER NOT NULL,
    `assigned_at` TIMESTAMP(0) NULL,
    `picked_up_at` TIMESTAMP(0) NULL,
    `on_progress_at` TIMESTAMP(0) NULL,
    `pending_at` TIMESTAMP(0) NULL,
    `closed_at` TIMESTAMP(0) NULL,
    `current_status` ENUM('ASSIGNED', 'PICKED_UP', 'ON_PROGRESS', 'PENDING', 'ESCALATED', 'CANCELLED', 'CLOSE') NOT NULL,
    `pending_reason` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `usersId_user` INTEGER NULL,

    UNIQUE INDEX `ticket_tracking_ticket_id_key`(`ticket_id`),
    INDEX `ticket_tracking_assigned_to_idx`(`assigned_to`),
    INDEX `ticket_tracking_current_status_idx`(`current_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `old_status` ENUM('ASSIGNED', 'PICKED_UP', 'ON_PROGRESS', 'PENDING', 'ESCALATED', 'CANCELLED', 'CLOSE') NULL,
    `new_status` ENUM('ASSIGNED', 'PICKED_UP', 'ON_PROGRESS', 'PENDING', 'ESCALATED', 'CANCELLED', 'CLOSE') NOT NULL,
    `changed_by` INTEGER NOT NULL,
    `changed_role` INTEGER NOT NULL,
    `note` VARCHAR(255) NULL,
    `changed_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `ticket_status_history_ticket_id_idx`(`ticket_id`),
    INDEX `ticket_status_history_changed_by_idx`(`changed_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_assignment_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `assigned_by` INTEGER NOT NULL,
    `assigned_to` INTEGER NOT NULL,
    `assigned_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `unassigned_at` TIMESTAMP(0) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ticket_assignment_history_ticket_id_idx`(`ticket_id`),
    INDEX `ticket_assignment_history_assigned_to_idx`(`assigned_to`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_activity_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,
    `activity_type` ENUM('ASSIGN', 'REASSIGN', 'STATUS_CHANGE', 'COMMENT', 'UPLOAD_EVIDENCE', 'CLOSE') NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `ticket_activity_log_ticket_id_idx`(`ticket_id`),
    INDEX `ticket_activity_log_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ticket_tracking` ADD CONSTRAINT `ticket_tracking_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_tracking` ADD CONSTRAINT `ticket_tracking_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id_user`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_tracking` ADD CONSTRAINT `ticket_tracking_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_tracking` ADD CONSTRAINT `ticket_tracking_usersId_user_fkey` FOREIGN KEY (`usersId_user`) REFERENCES `users`(`id_user`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_status_history` ADD CONSTRAINT `ticket_status_history_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_status_history` ADD CONSTRAINT `ticket_status_history_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_assignment_history` ADD CONSTRAINT `ticket_assignment_history_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_assignment_history` ADD CONSTRAINT `ticket_assignment_history_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_assignment_history` ADD CONSTRAINT `ticket_assignment_history_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_activity_log` ADD CONSTRAINT `ticket_activity_log_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ticket`(`id_ticket`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_activity_log` ADD CONSTRAINT `ticket_activity_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id_user`) ON DELETE RESTRICT ON UPDATE CASCADE;
