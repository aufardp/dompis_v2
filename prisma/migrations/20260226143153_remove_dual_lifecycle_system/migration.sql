-- Drop index on current_status
DROP INDEX `ticket_tracking_current_status_idx` ON `ticket_tracking`;

-- Drop current_status column from ticket_tracking
ALTER TABLE `ticket_tracking` DROP COLUMN `current_status`;

-- Modify ticket_status_history to use VARCHAR instead of ENUM
-- This preserves audit history while decoupling from lifecycle logic
ALTER TABLE `ticket_status_history` 
  MODIFY COLUMN `old_status` VARCHAR(50) NULL,
  MODIFY COLUMN `new_status` VARCHAR(50) NOT NULL;
