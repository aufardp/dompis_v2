-- Bounding-box kolom untuk fitur garis (jalur kabel) KML, supaya bisa
-- difilter viewport langsung di DB (sebelumnya cuma titik yang punya
-- lat/lng, garis selalu NULL sehingga filter bbox gabungan meng-exclude
-- semua baris garis). Additive only.
ALTER TABLE `kml_feature`
  ADD COLUMN `path_min_lat` DECIMAL(10, 7) NULL,
  ADD COLUMN `path_max_lat` DECIMAL(10, 7) NULL,
  ADD COLUMN `path_min_lng` DECIMAL(10, 7) NULL,
  ADD COLUMN `path_max_lng` DECIMAL(10, 7) NULL,
  ADD INDEX `idx_kml_feature_line_bbox` (`kml_layer_id`, `feature_type`, `path_min_lat`, `path_max_lat`);

-- Skema jaringan tidak lagi otomatis aktif saat War Map dibuka; default
-- baru untuk kolom (baris baru) sekaligus backfill baris yang sudah ada.
ALTER TABLE `kml_sublayer`
  ALTER COLUMN `default_visible` SET DEFAULT false;

UPDATE `kml_sublayer` SET `default_visible` = false;
