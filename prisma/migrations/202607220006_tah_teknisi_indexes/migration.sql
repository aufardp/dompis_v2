-- ============================================================
-- Phase 8: Composite indexes untuk technicians + GAUL queries
-- ============================================================
-- 1. idx_tah_ticket_assigned_active: covering index untuk
--    correlated subquery di /api/technicians.
--    Subquery: EXISTS (SELECT 1 FROM ticket_assignment_history
--    WHERE ticket_id = ? AND assigned_at >= ? AND is_active = true)
--    Tanpa index: full table scan tiap eksekusi
-- ============================================================

ALTER TABLE `ticket_assignment_history`
  ADD INDEX `idx_tah_ticket_assigned_active` (`ticket_id`, `assigned_at`, `is_active`);

-- ============================================================
-- 2. idx_ticket_teknisi_status_update: covering index untuk
--    query technicians dashboard filter by teknisi_user_id + status_update.
--    Lebih optimal dari idx_ticket_teknisi_dashboard (5 kolom)
--    karena kolom pertama lebih selektif dan index lebih sempit.
-- ============================================================

ALTER TABLE `ticket`
  ADD INDEX `idx_ticket_teknisi_status_update` (`teknisi_user_id`, `status_update`, `reported_date`, `closed_at`);
