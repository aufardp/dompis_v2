-- Penempatan geografis user: kolom skalar region_id + branch_id di `users`
-- (area_id sudah ada). Atribut data/laporan; cakupan akses tetap via user_region/branch/area.

ALTER TABLE `users`
  ADD COLUMN `region_id` INT NULL,
  ADD COLUMN `branch_id` INT NULL;

ALTER TABLE `users` ADD CONSTRAINT `users_region_id_fkey`
  FOREIGN KEY (`region_id`) REFERENCES `region`(`id_region`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_fkey`
  FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id_branch`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `idx_users_region` ON `users`(`region_id`);
CREATE INDEX `idx_users_branch` ON `users`(`branch_id`);

-- Backfill dari hierarki area -> branch -> region (semua area punya branch, semua branch punya region).
UPDATE `users` u
  JOIN `area` a   ON a.id_area   = u.area_id
  JOIN `branch` b ON b.id_branch = a.branch_id
  SET u.branch_id = b.id_branch,
      u.region_id = b.region_id
  WHERE u.area_id IS NOT NULL;
