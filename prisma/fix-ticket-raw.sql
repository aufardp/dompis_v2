-- Migration script untuk ticket_raw
-- Jalankan via: mysql -u root -p dompis_db < prisma/fix-ticket-raw.sql

SET FOREIGN_KEY_CHECKS = 0;

-- Drop operational fields (belongs to ticket table, not ticket_raw)
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS teknisi_user_id;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS closed_at;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS status_update;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS status_manja;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS flagging_manja;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS jenis_tiket;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS alamat;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS rca;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS sub_rca;

-- Drop TTR fields (redundant, stored elsewhere)
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS jam_expired;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS jam_expired_12_jam_gold;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS jam_expired_24_jam_reguler;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS jam_expired_3_jam_diamond;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS jam_expired_6_jam_platinum;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS manja_expired;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS redaman;

ALTER TABLE ticket_raw DROP COLUMN IF EXISTS status_ttr_12_gold;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS status_ttr_24_reguler;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS status_ttr_3_diamond;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS status_ttr_6_platinum;

ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_indibiz_4_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_indibiz_24_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_indihome_reseller_6_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_indihome_reseller_36_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_k1_datin_1_5_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_k1_repair_k2_datin_3_6_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_k3_datin_7_2_jam;
ALTER TABLE ticket_raw DROP COLUMN IF EXISTS ttr_wifi_24_jam;

-- Rename column cause_problem -> cause (jika ada)
-- ALTER TABLE ticket_raw CHANGE COLUMN cause_problem cause VARCHAR(50);

-- Add new sync metadata columns
ALTER TABLE ticket_raw ADD COLUMN sourceTable VARCHAR(50) DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN sourceHash VARCHAR(64) DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN lastSeenAt TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN sourceUpdatedAt TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN syncBatchId VARCHAR(50) DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN syncVersion INT DEFAULT 1;
ALTER TABLE ticket_raw ADD COLUMN isActive BOOLEAN DEFAULT TRUE;
ALTER TABLE ticket_raw ADD COLUMN importedAt TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN rawPayload JSON DEFAULT NULL;
ALTER TABLE ticket_raw ADD COLUMN street_address TEXT DEFAULT NULL;

-- Add indexes
ALTER TABLE ticket_raw ADD INDEX idx_source_identity (sourceTable, incident);
ALTER TABLE ticket_raw ADD INDEX idx_hash (sourceHash);
ALTER TABLE ticket_raw ADD INDEX idx_active_seen (isActive, lastSeenAt);
ALTER TABLE ticket_raw ADD INDEX idx_batch (syncBatchId);
ALTER TABLE ticket_raw ADD INDEX idx_status_active (status, isActive);
ALTER TABLE ticket_raw ADD INDEX idx_service_no (service_no);
ALTER TABLE ticket_raw ADD INDEX idx_customer_identity (customer_id, service_no, reported_date);

-- Update existing records
UPDATE ticket_raw SET importedAt = NOW() WHERE importedAt IS NULL;
UPDATE ticket_raw SET lastSeenAt = NOW() WHERE lastSeenAt IS NULL;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migration completed successfully!' as status;