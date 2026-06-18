-- Add uploader metadata for import-tiket batch history
ALTER TABLE `projection_request`
  ADD COLUMN `uploaded_by` VARCHAR(100) NULL AFTER `sync_batch_id`;
