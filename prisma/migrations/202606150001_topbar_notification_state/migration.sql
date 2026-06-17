CREATE TABLE `topbar_notification_state` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `scope` VARCHAR(20) NOT NULL,
  `notification_key` VARCHAR(191) NOT NULL,
  `ticket_code` VARCHAR(100) NULL,
  `bucket_label` VARCHAR(100) NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `read_at` TIMESTAMP(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_topbar_notification_state` (`user_id`, `scope`, `notification_key`),
  KEY `idx_topbar_notif_user_scope_read` (`user_id`, `scope`, `is_read`),
  KEY `idx_topbar_notif_updated` (`updated_at`),
  CONSTRAINT `topbar_notification_state_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id_user`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
