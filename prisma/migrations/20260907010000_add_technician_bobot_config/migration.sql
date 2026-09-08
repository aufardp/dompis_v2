-- Bobot per kategori tiket close teknisi (untuk Rekap Close Teknisi).
-- Satu baris per kolom rekap: CUS / PRO / MAN / OHI / REP.
-- Ambang produktivitas disimpan terpisah di tabel system_config.

CREATE TABLE IF NOT EXISTS `technician_bobot_config` (
  `bucket_key` VARCHAR(20) NOT NULL,
  `label`      VARCHAR(50) NOT NULL,
  `bobot`      DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  `sort_order` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`bucket_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `technician_bobot_config` (`bucket_key`, `label`, `bobot`, `sort_order`) VALUES
  ('CUS', 'Customer',   1.00, 1),
  ('PRO', 'Proactive',  1.00, 2),
  ('MAN', 'Manual',     1.00, 3),
  ('OHI', 'Unspec OHI', 1.00, 4),
  ('REP', 'Permintaan', 1.00, 5)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

-- Ambang PRODUCTIVITY dari BOBOT AVG (bisa diedit admin via /api/technicians/bobot-config).
INSERT INTO `system_config` (`key`, `value`) VALUES
  ('recap_produktif_tinggi_min', '4'),
  ('recap_produktif_sedang_min', '2')
ON DUPLICATE KEY UPDATE `key` = `key`;
