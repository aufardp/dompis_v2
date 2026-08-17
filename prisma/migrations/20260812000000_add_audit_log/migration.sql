-- M5 — Audit trail terpusat lintas-objek (PRD 5.5).
-- Additive only, tidak menyentuh kolom/tabel existing.

-- actor_id/actor_name NOT NULL-constrained via app layer (anonymous/system akun 0).
-- meta Json: referensi id saja (PII redacted); ip_address + user_agent dari request.
CREATE TABLE `audit_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actor_id` INT NULL,
    `actor_role` VARCHAR(50) NULL,
    `actor_name` VARCHAR(100) NULL,
    `action` VARCHAR(100) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` VARCHAR(100) NULL,
    `meta` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`),
    INDEX `idx_audit_actor_created` (`actor_id`, `created_at`),
    INDEX `idx_audit_action_created` (`action`, `created_at`),
    INDEX `idx_audit_resource` (`resource_type`, `resource_id`),
    INDEX `idx_audit_created` (`created_at`)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;