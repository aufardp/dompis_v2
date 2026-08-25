-- Tabel target KPI yang bisa diatur lewat halaman admin, dipakai untuk
-- menghitung % achievement di section TTR Compliance/Assurance Guarantee
-- di halaman overview. Tabel baru, additive only.
CREATE TABLE `kpi_target` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `metric_key` VARCHAR(50) NOT NULL,
  `target_value` DECIMAL(6, 2) NOT NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `kpi_target_metric_key_key` (`metric_key`)
) DEFAULT CHARACTER SET utf8mb4;

INSERT INTO `kpi_target` (`metric_key`, `target_value`, `updated_at`) VALUES
  ('ttr_comply_manja', 94.79, NOW(3)),
  ('ttr_comply_diamond', 95.25, NOW(3)),
  ('ttr_comply_platinum', 95.00, NOW(3)),
  ('ttr_comply_gold', 83.00, NOW(3)),
  ('ttr_comply_reguler', 86.70, NOW(3)),
  ('max_ticket_open', 268.00, NOW(3)),
  ('assurance_guarantee', 91.71, NOW(3));
