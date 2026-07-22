-- Remove duplicate projectedAt index
--
-- Migration 202607220002 created idx_ticket_projection_log_projected_at
-- but Prisma had already auto-generated idx_projection_log_projected_at
-- from @@index([projectedAt]) in schema.prisma (no map name).
-- Keep the explicit name, drop the auto-generated duplicate.

DROP INDEX `idx_projection_log_projected_at` ON `ticket_projection_log`;
