-- Backfill NULL timestamps on user scope join tables.
-- These tables are written by Prisma (createMany) which previously omitted the
-- timestamp columns because the schema had no default.

UPDATE `user_sa` SET `created_at` = NOW() WHERE `created_at` IS NULL;
UPDATE `user_sa` SET `updated_at` = NOW() WHERE `updated_at` IS NULL;

UPDATE `user_region` SET `created_at` = NOW() WHERE `created_at` IS NULL;
UPDATE `user_region` SET `updated_at` = NOW() WHERE `updated_at` IS NULL;

UPDATE `user_branch` SET `created_at` = NOW() WHERE `created_at` IS NULL;
UPDATE `user_branch` SET `updated_at` = NOW() WHERE `updated_at` IS NULL;

UPDATE `user_area` SET `created_at` = NOW() WHERE `created_at` IS NULL;
UPDATE `user_area` SET `updated_at` = NOW() WHERE `updated_at` IS NULL;

-- Align user_sa with the other three scope tables (DB-level defaults), so
-- inserts made outside Prisma also get timestamps.
ALTER TABLE `user_sa`
  MODIFY `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
