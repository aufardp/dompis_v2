-- ============================================================
-- Phase 4 — INSERT Stabilization & Server Duplication Fix
-- Eksekusi manual via phpMyAdmin
-- Urutan: STEP 1 dulu, lalu STEP 2
-- ============================================================

-- ============================================================
-- STEP 1 (hanya jika belum jalan): Add index projectedAt
-- ============================================================
ALTER TABLE `ticket_projection_log`
  ADD INDEX `idx_ticket_projection_log_projected_at` (`projectedAt`);

-- ============================================================
-- STEP 2: Drop duplicate auto-generated index
-- Prisma auto-generated idx_projection_log_projected_at (tanpa map,
-- dari @@index([projectedAt]) di schema.prisma).
-- Migration baru explicit idx_ticket_projection_log_projected_at.
-- Dua index projectedAt → drop yang auto-generated.
-- ============================================================
DROP INDEX `idx_projection_log_projected_at` ON `ticket_projection_log`;
