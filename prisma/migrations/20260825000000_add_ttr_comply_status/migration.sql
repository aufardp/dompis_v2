-- Status comply/non-comply TTR per tiket, dihitung sekali saat tiket
-- closed (lihat lib/projection/index.ts + app/libs/tickets/ttr-comply.ts).
-- NULL = belum closed, atau kategori jenis/customer_type-nya tidak punya
-- max-TTR yang jelas (dikecualikan dari perhitungan, bukan didefaultkan).
-- ttr_deadline_at = deadline efektif yang dipakai saat evaluasi, untuk audit.
-- Additive only.
ALTER TABLE `ticket`
  ADD COLUMN `ttr_comply_status` VARCHAR(20) NULL,
  ADD COLUMN `ttr_deadline_at` DATETIME NULL;

CREATE INDEX `idx_ticket_ttr_comply`
  ON `ticket` (`ttr_comply_status`, `closed_at`);
