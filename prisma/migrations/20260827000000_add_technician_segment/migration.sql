-- Spesialisasi teknisi B2B/B2C, diatur admin lewat Manajemen User.
-- NULL = belum diklasifikasi (default untuk teknisi lama & baru).
-- Additive only.
ALTER TABLE `users`
  ADD COLUMN `technician_segment` VARCHAR(10) NULL;
