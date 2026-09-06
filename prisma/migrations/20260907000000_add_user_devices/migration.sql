-- FCM push notifications: per-user device token store.
-- One row per FCM registration token; `fcm_token` is globally unique so a token
-- re-registered under a new user simply transfers ownership (upsert on fcm_token).

CREATE TABLE IF NOT EXISTS `user_devices` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `user_id`    INT NOT NULL,
  `fcm_token`  VARCHAR(255) NOT NULL,
  `platform`   VARCHAR(20) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_devices_fcm_token` (`fcm_token`),
  KEY `idx_user_devices_user` (`user_id`),
  CONSTRAINT `user_devices_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id_user`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
