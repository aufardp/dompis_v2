-- Fase B — Preservasi style KML asli: tambah kolom styling di kml_feature
-- Additive only, tidak menyentuh tabel existing.

-- AlterTable: simpan LineStyle/IconStyle asli dari file KML (PRD §9.4).
-- line_color / line_width  -> LineStyle.color (hex #rrggbb) & width
-- icon_key                 -> bentuk ikon hasil normalisasi href: star|pushpin|dot|square|triangle
-- icon_color / icon_scale  -> IconStyle.color (tint hex #rrggbb) & scale
ALTER TABLE `kml_feature`
    ADD COLUMN `line_color` VARCHAR(20) NULL,
    ADD COLUMN `line_width` DOUBLE NULL,
    ADD COLUMN `icon_key` VARCHAR(20) NULL,
    ADD COLUMN `icon_color` VARCHAR(20) NULL,
    ADD COLUMN `icon_scale` DOUBLE NULL;
