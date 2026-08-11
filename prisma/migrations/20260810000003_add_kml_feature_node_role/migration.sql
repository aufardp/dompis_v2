-- M4 — Klasifikasi peran node jaringan (ODC/ODP/TIANG) di kml_feature (PRD §H/M4).
-- Additive only, tidak menyentuh kolom/tabel existing.

-- node_role: 'odc' | 'odp' | 'tiang' | NULL (bukan node, mis. garis/galian/lainnya)
ALTER TABLE `kml_feature`
    ADD COLUMN `node_role` VARCHAR(20) NULL;