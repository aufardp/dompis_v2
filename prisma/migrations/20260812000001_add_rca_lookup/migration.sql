-- M6 — RCA Suggestion lookup (PRD 5.4).
-- Indeks pendukung query co-occurrence 180 hari: device_name → (rca, sub_rca, closed_at).
-- Additive only.

CREATE INDEX `idx_ticket_rca_lookup`
  ON `ticket` (`device_name`, `rca`, `sub_rca`, `closed_at`);