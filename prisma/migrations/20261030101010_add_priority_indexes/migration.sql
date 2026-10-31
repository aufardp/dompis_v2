-- Migration to add indexes for Priority 5 Branch page performance
CREATE INDEX idx_ticket_priority_scope
  ON ticket (workzone, jenis_tiket_2, reported_date_dt)
  ALGORITHM=INPLACE, LOCK=NONE;

CREATE INDEX idx_ticket_priority_service
  ON ticket (service_no, reported_date_dt, jenis_tiket_2)
  ALGORITHM=INPLACE, LOCK=NONE;
