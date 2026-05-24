ALTER TABLE `ticket`
  ADD INDEX `idx_ticket_search_service_no` (`service_no`),
  ADD INDEX `idx_ticket_search_contact_phone` (`contact_phone`),
  ADD INDEX `idx_ticket_search_contact_name` (`contact_name`),
  ADD INDEX `idx_ticket_search_customer_name` (`customer_name`),
  ADD INDEX `idx_ticket_search_gamas` (`ticket_id_gamas`);
