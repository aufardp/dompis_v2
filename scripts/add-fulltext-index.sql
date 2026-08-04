-- FULLTEXT Index untuk LIKE '%...%' pada jenis_tiket_1, jenis_tiket_2, symptom
-- Run sekali di production (butuh MySQL restart kalau innodb_ft_min_token_size belum 3)

-- 1. Cek config FULLTEXT (run di MySQL):
-- SHOW VARIABLES LIKE 'innodb_ft_min_token_size';
-- Kalau > 3, set di my.cnf: innodb_ft_min_token_size=3 lalu restart MySQL

-- 2. Buat FULLTEXT index (hanya run sekali setelah config siap):
ALTER TABLE `ticket` 
  ADD FULLTEXT INDEX `idx_ticket_jenis_fulltext` (`jenis_tiket_1`, `jenis_tiket_2`, `symptom`);

-- 3. Query pattern yang akan pakai FULLTEXT (ubah di daily-ticket.service.ts buildSqlWhereClause):
-- SEBELUM: jenis_tiket_1 LIKE '%keyword%'
-- SESUDAH: MATCH(jenis_tiket_1, jenis_tiket_2) AGAINST('+keyword*' IN BOOLEAN MODE)

-- Contoh penggunaan di WHERE clause:
-- WHERE MATCH(jenis_tiket_1, jenis_tiket_2) AGAINST('+network*' IN BOOLEAN MODE)
-- WHERE MATCH(symptom) AGAINST('+error +timeout*' IN BOOLEAN MODE)

-- Note: FULLTEXT butuh minimal 3 karakter token (default innodb_ft_min_token_size=3)
-- Keyword pendek (< 3 char) tidak akan di-index