-- Cleanup redundant / unused indexes on `ticket` table
--
-- idx_ticket_witel:     no query filters, sorts, joins, or groups by witel
-- idx_ticket_guarantee: cardinality = 2-3 values, too low selectivity
-- idx_tech_status:      redundant — covered by idx_auto_assign_lookup (teknisi_user_id, status_update, rk_information)

DROP INDEX `idx_ticket_witel` ON `ticket`;
DROP INDEX `idx_ticket_guarantee` ON `ticket`;
DROP INDEX `idx_tech_status` ON `ticket`;
