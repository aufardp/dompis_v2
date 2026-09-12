-- Fase 1 dari migrasi reported_date VARCHAR -> DATETIME.
-- Kolom baru DITAMBAH sebagai kolom nullable terpisah (reported_date_dt),
-- kolom `reported_date` VARCHAR yang ada TIDAK disentuh — semua kode/query
-- existing tetap jalan persis seperti sebelumnya, nol risiko.
--
-- Setelah ini di-deploy:
--   1. Kode projection (lib/projection/index.ts) mulai mengisi
--      reported_date_dt untuk setiap tiket yang diproses (data baru & yang
--      di-update) — lihat perubahan buildProjectionUpsert/TICKET_BULK_COLUMNS.
--   2. Jalankan `npm run backfill:reported-date-dt` untuk mengisi
--      reported_date_dt pada baris-baris lama yang sudah ada.
--   3. Setelah backfill selesai & hasilnya ditinjau (baris yang gagal parse
--      di-set NULL + dicatat), baru lakukan Fase 2 (migrasi terpisah): swap
--      nama kolom + tambah index composite yang tepat + ganti tipe di
--      schema.prisma jadi definitif.
--
-- ALGORITHM=INSTANT: MySQL 8 hanya menulis metadata, tidak menyalin/mengunci
-- tabel — aman untuk tabel `ticket` yang besar & terus menerima trafik.
ALTER TABLE `ticket`
  ADD COLUMN `reported_date_dt` DATETIME NULL AFTER `reported_date`,
  ALGORITHM=INSTANT;
