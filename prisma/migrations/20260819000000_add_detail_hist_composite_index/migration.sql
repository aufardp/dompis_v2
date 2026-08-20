-- M8 — Indeks komposit untuk lookup detail tiket (getTicketDetailForActor).
-- Pola query: WHERE ticket_id=? ORDER BY <timestamp> DESC LIMIT n.
-- Additive only.

CREATE INDEX `idx_activity_log_ticket_created`
  ON `ticket_activity_log` (`ticket_id`, `created_at`);

CREATE INDEX `idx_assignment_history_ticket_assigned`
  ON `ticket_assignment_history` (`ticket_id`, `assigned_at`);

CREATE INDEX `idx_slh_ticket_tagged`
  ON `service_location_history` (`ticket_id`, `tagged_at`);