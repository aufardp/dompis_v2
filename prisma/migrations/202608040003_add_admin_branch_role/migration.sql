-- Add the "Admin Branch" role (id 6).

INSERT INTO `roles` (`id_role`, `name`, `key`, `created_at`, `updated_at`)
VALUES (6, 'Admin Branch', 'admin_branch', NOW(), NOW())
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `key` = VALUES(`key`);
