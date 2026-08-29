-- Ganti nama kolom resolved_date → resolve_date di tabel ticket
-- untuk konsistensi dengan kolom resolve_date pada ticket_raw
-- (dari endpoint Nossa). Additive only.
ALTER TABLE `ticket`
  CHANGE COLUMN `resolved_date` `resolve_date` TIMESTAMP(0) NULL;
