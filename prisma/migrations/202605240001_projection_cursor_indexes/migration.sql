ALTER TABLE `ticket_raw`
  ADD INDEX `idx_ticket_raw_projection_cursor` (`importedAt`, `id_ticket`),
  ADD INDEX `idx_ticket_raw_projection_batch_cursor` (`syncBatchId`, `importedAt`, `id_ticket`);
