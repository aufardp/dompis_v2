-- Tabel baru untuk field QOSMIC Bridge yang sebelumnya tidak punya tempat
-- penyimpanan sama sekali. `ticket_raw` sudah mentok limit row size InnoDB
-- (8126 byte, not counting BLOBs) dengan ~95 kolomnya sekarang — bahkan
-- menambah SATU kolom TEXT nullable saja sudah gagal dengan error yang sama
-- (diverifikasi langsung terhadap DB dev sebelum migration ini ditulis).
--
-- Field-field ini hanya pernah dikirim oleh QOSMIC Bridge (nossa/nossa_closed)
-- — tidak ada di piloting_tickets atau scrap MySQL langsung — jadi tabel ini
-- hanya pernah ditulis oleh satu sumber, tanpa perlu logika resolusi konflik
-- multi-sumber seperti ticket_raw.
CREATE TABLE `ticket_raw_bridge_ext` (
  `incident` VARCHAR(50) NOT NULL,
  `segment` TEXT NULL,
  `osm_resolved_code` TEXT NULL,
  `assigned_owner_group` TEXT NULL,
  `rca` TEXT NULL,
  `tknode` TEXT NULL,
  `hostname` TEXT NULL,
  `ticket_details` TEXT NULL,
  `isobsolete` TEXT NULL,
  `c_pending_status` TEXT NULL,
  `c_description_serviceid` TEXT NULL,
  `c_mycx_result` TEXT NULL,
  `c_hostname_olt` TEXT NULL,
  `c_service_category` TEXT NULL,
  `c_slg_ttr` TEXT NULL,
  `c_working_hour` TEXT NULL,
  `c_package` TEXT NULL,
  `c_ibooster_alert_id` TEXT NULL,
  `total_service_indibiz` TEXT NULL,
  `total_service_indihome` TEXT NULL,
  `total_service_nodeb` TEXT NULL,
  `total_all_service` TEXT NULL,
  `total_lis_indihome` TEXT NULL,
  `total_lis_indibiz` TEXT NULL,
  `total_service_datin` TEXT NULL,
  `total_service_vula` TEXT NULL,
  `total_service_sdwan` TEXT NULL,
  `total_service_wifi` TEXT NULL,
  `c_area_tif` TEXT NULL,
  `c_district_tif` TEXT NULL,
  `c_regional_tif` TEXT NULL,
  `c_tsc_result_category` TEXT NULL,
  `c_slg_ncx` TEXT NULL,
  `inserted_date` TEXT NULL,
  `c_cts_cause` TEXT NULL,
  `c_cts_resolution` TEXT NULL,
  `jml_tiket_anak_gamas` TEXT NULL,
  `c_solution_code` TEXT NULL,
  `sourceTable` VARCHAR(50) NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`incident`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
