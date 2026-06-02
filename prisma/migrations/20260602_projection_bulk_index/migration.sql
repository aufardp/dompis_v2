-- AlterTable
ALTER TABLE `ticket_projection_checkpoint` ADD COLUMN `neverProjectedCount` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `idx_outbox_dispatch` ON `tech_event_outbox`(`status`, `next_attempt_at`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_outbox_stuck_reset` ON `tech_event_outbox`(`status`, `updated_at`);

-- CreateIndex
CREATE INDEX `idx_outbox_cleanup` ON `tech_event_outbox`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_assignment_history_technician_range` ON `ticket_assignment_history`(`assigned_to`, `assigned_at`, `is_active`);

-- CreateIndex
CREATE INDEX `idx_projection_log_raw_status` ON `ticket_projection_log`(`ticketRawId`, `status`);

-- CreateIndex
CREATE INDEX `idx_ticket_raw_active_cursor` ON `ticket_raw`(`isActive`, `importedAt`, `id_ticket`);

