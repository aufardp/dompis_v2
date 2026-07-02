-- Add a dispatch-friendly composite index for tech_event_outbox.
-- This matches the worker query that filters by status, dispatchable event type,
-- and next_attempt_at before ordering by created_at.

CREATE INDEX `idx_outbox_dispatchable`
  ON `tech_event_outbox`(`status`, `event_type`, `next_attempt_at`, `created_at`);
