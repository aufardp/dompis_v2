-- Phase 2 EXPLAIN checklist
-- Jalankan di staging / salinan production yang aman.

-- 1. Daily board utama
EXPLAIN
SELECT id_ticket, incident, reported_date, status_update, workzone
FROM ticket
WHERE sync_date = CURDATE()
  AND workzone IN ('JATIM', 'SURAMADU')
  AND status != 'closed'
ORDER BY reported_date DESC, id_ticket ASC
LIMIT 20 OFFSET 0;

-- 2. Daily validasi board
EXPLAIN
SELECT id_ticket, incident, reported_date, status_update, worklog_summary
FROM ticket
WHERE sync_date = CURDATE()
  AND workzone IN ('JATIM', 'SURAMADU')
  AND status != 'closed'
  AND (
    status_update = 'close'
    OR worklog_summary = 'Tech Closed'
  )
ORDER BY reported_date DESC, id_ticket ASC
LIMIT 20 OFFSET 0;

-- 3. Search incident/service
EXPLAIN
SELECT id_ticket, incident, service_no
FROM ticket
WHERE workzone IN ('JATIM', 'SURAMADU')
  AND (
    incident = 'INC123456'
    OR incident LIKE 'INC123456%'
    OR service_no = '123456789'
    OR service_no LIKE '123456789%'
  )
ORDER BY id_ticket DESC
LIMIT 20;

-- 3a. Search runtime baru: ticket code / incident
EXPLAIN
SELECT id_ticket, incident, service_no
FROM ticket
WHERE workzone IN ('JATIM', 'SURAMADU')
  AND (
    incident = 'INC123456'
    OR incident LIKE 'INC123456%'
    OR ticket_id_gamas = 'INC123456'
    OR ticket_id_gamas LIKE 'INC123456%'
  )
ORDER BY id_ticket DESC
LIMIT 20;

-- 3b. Search runtime baru: numeric service / phone
EXPLAIN
SELECT id_ticket, incident, service_no
FROM ticket
WHERE workzone IN ('JATIM', 'SURAMADU')
  AND (
    service_no = '123456789'
    OR service_no LIKE '123456789%'
    OR contact_phone LIKE '123456789%'
  )
ORDER BY id_ticket DESC
LIMIT 20;

-- 3c. Search runtime baru: contact/customer text
EXPLAIN
SELECT id_ticket, incident, service_no
FROM ticket
WHERE workzone IN ('JATIM', 'SURAMADU')
  AND (
    contact_name LIKE '%BUDI%'
    OR customer_name LIKE '%BUDI%'
  )
ORDER BY id_ticket DESC
LIMIT 20;

-- 4. Operations summary focus
EXPLAIN
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status_update = 'close' THEN 1 ELSE 0 END) AS close_count
FROM ticket
WHERE sync_date = CURDATE()
  AND workzone IN ('JATIM', 'SURAMADU');

-- 5. Projection cursor read
EXPLAIN
SELECT id_ticket, incident, importedAt
FROM ticket_raw
WHERE isActive = TRUE
ORDER BY importedAt ASC, id_ticket ASC
LIMIT 300;

-- 6. Status refresh candidate query
EXPLAIN
SELECT
  tr.id_ticket,
  tr.incident,
  tr.sourceTable,
  tr.status
FROM status_refresh_ticket_state s
INNER JOIN ticket_raw tr ON tr.incident = s.incident
WHERE s.lastCheckedAt < NOW() - INTERVAL 2 MINUTE
  AND tr.sourceTable IS NOT NULL
  AND tr.isActive = TRUE
  AND (tr.status IS NULL OR tr.status NOT IN ('closed', 'close', 'resolved'))
ORDER BY s.lastCheckedAt ASC
LIMIT 300;
