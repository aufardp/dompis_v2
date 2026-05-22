-- Production-safe workflow/autoassign indexes.
-- These statements are guarded so rerunning on an existing database is safe.

DROP PROCEDURE IF EXISTS add_index_if_missing;

DELIMITER //
CREATE PROCEDURE add_index_if_missing(
  IN table_name_in VARCHAR(64),
  IN index_name_in VARCHAR(64),
  IN ddl_in TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = table_name_in
      AND index_name = index_name_in
  ) THEN
    SET @ddl = ddl_in;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//
DELIMITER ;

CALL add_index_if_missing(
  'ticket',
  'idx_ticket_autoassign_daily',
  'CREATE INDEX idx_ticket_autoassign_daily ON ticket (sync_date, teknisi_user_id, status_update, rk_information, jam_expired)'
);

CALL add_index_if_missing(
  'ticket_assignment_history',
  'idx_assignment_history_ticket_active',
  'CREATE INDEX idx_assignment_history_ticket_active ON ticket_assignment_history (ticket_id, is_active)'
);

CALL add_index_if_missing(
  'cluster_node',
  'idx_cluster_node_active_odc',
  'CREATE INDEX idx_cluster_node_active_odc ON cluster_node (is_active, odc_value)'
);

CALL add_index_if_missing(
  'cluster_assignment',
  'idx_cluster_assignment_date_active_cluster',
  'CREATE INDEX idx_cluster_assignment_date_active_cluster ON cluster_assignment (assigned_date, is_active, cluster_id)'
);

CALL add_index_if_missing(
  'technician_attendance',
  'idx_attendance_date_technician',
  'CREATE INDEX idx_attendance_date_technician ON technician_attendance (date, technician_id)'
);

DROP PROCEDURE IF EXISTS add_index_if_missing;
