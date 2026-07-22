-- Add index on projectedAt for ticket_projection_log cleanup query
--
-- The cleanup query:
--   DELETE FROM ticket_projection_log WHERE projectedAt < ? LIMIT ?
--
-- Was performing a full table scan (60s timeout). This index enables
-- range scan → immediate seek.
--
-- Note: @@index([projectedAt]) was already declared in schema.prisma
-- but was never created in any migration.

ALTER TABLE `ticket_projection_log`
  ADD INDEX `idx_ticket_projection_log_projected_at` (`projectedAt`);
