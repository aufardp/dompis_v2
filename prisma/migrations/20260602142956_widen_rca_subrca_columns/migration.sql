-- Widen rca and sub_rca columns from VarChar(10) to VarChar(100)
-- to accommodate actual RCA/subRCA dropdown values (e.g. "PORT / KABEL HDMI TV PELG BERMASALAH")

ALTER TABLE `ticket` MODIFY COLUMN `rca` VARCHAR(100) NULL;
ALTER TABLE `ticket` MODIFY COLUMN `sub_rca` VARCHAR(100) NULL;
