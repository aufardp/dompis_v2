-- ============================================================
-- Diagnosa: Mengapa bucket customer kosong?
-- Jalankan di VPS via: mysql -u root -p dompis_db < scripts/sql/diagnosa-bucket-customer.sql
-- ============================================================

-- 1. CEK DATA DASAR
-- ============================================================
SELECT '=== 1. DISTINCT source_ticket ===' AS '';
SELECT DISTINCT source_ticket FROM ticket;
SELECT '=== 1b. Jumlah ticket dengan source_ticket = customer ===' AS '';
SELECT COUNT(*) AS total_customer_tickets FROM ticket WHERE LOWER(source_ticket) = 'customer';

-- 2. CEK KLASIFIKASI JENIS_TIKET
-- ============================================================
SELECT '=== 2. Distribusi jenis_tiket_1 untuk customer ===' AS '';
SELECT jenis_tiket_1, COUNT(*) AS cnt
FROM ticket WHERE LOWER(source_ticket) = 'customer'
GROUP BY jenis_tiket_1 ORDER BY cnt DESC;

-- 3. CEK NON-TECHNICAL EXCLUSION
-- ============================================================
SELECT '=== 3. Customer tickets yang masuk non-technical ===' AS '';
SELECT COUNT(*) AS non_technical_count FROM ticket
WHERE LOWER(source_ticket) = 'customer'
  AND (
    classification_flag LIKE '%nontech%'
    OR classification_flag LIKE '%non technical%'
    OR classification_flag LIKE '%billing%'
    OR jenis_tiket_1 LIKE '%unknown%'
    OR jenis_tiket_1 LIKE '%permintaan%'
    OR jenis_tiket_1 LIKE '%infracare%'
    OR jenis_tiket_1 LIKE '%billing%'
    OR jenis_tiket_1 LIKE '%digital_spbu%'
    OR jenis_tiket_2 LIKE '%unknown%'
    OR jenis_tiket_2 LIKE '%digital_spbu%'
    OR jenis_tiket_1 IS NULL
  );

SELECT '=== 3b. Sample non-technical customer tickets ===' AS '';
SELECT incident, source_ticket, classification_flag, jenis_tiket_1, jenis_tiket_2, status
FROM ticket WHERE LOWER(source_ticket) = 'customer'
  AND (
    classification_flag LIKE '%nontech%'
    OR jenis_tiket_1 LIKE '%unknown%'
    OR jenis_tiket_1 IS NULL
  )
LIMIT 20;

-- 4. CEK OBSOLETE (Z_PERMINTAAN_044)
-- ============================================================
SELECT '=== 4. Obsolete tickets ===' AS '';
SELECT classification_path, COUNT(*) AS cnt
FROM ticket WHERE classification_path = 'Z_PERMINTAAN_044'
GROUP BY classification_path;

-- 5. CEK PROJECTION LAG
-- ============================================================
SELECT '=== 5. Projection lag ===' AS '';
SELECT COUNT(*) AS unprojected_raw_rows FROM ticket_raw tr
WHERE tr.isActive = TRUE AND tr.importedAt IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ticket_projection_log tpl
    WHERE tpl.ticketRawId = tr.id_ticket AND tpl.status = 'success'
  );

SELECT '=== 5b. Projection checkpoint ===' AS '';
SELECT * FROM ticket_projection_checkpoint;

SELECT '=== 5c. Pending projection requests ===' AS '';
SELECT id, source, sync_batch_id, created_at,
  CASE WHEN processed_at IS NULL THEN 'PENDING' ELSE 'PROCESSED' END AS status
FROM projection_request
ORDER BY created_at DESC
LIMIT 20;

-- 6. CEK DAILY FILTER EXCLUSION
-- ============================================================
SELECT '=== 6. Customer tickets sample (status + dates) ===' AS '';
SELECT incident, source_ticket, status, closed_at, sync_date, reported_date,
  CASE
    WHEN status IN ('closed','Closed','CLOSED','Closed Completed') THEN 'CLOSED'
    ELSE 'OPEN'
  END AS is_closed
FROM ticket WHERE LOWER(source_ticket) = 'customer'
ORDER BY reported_date DESC
LIMIT 30;

-- 7. CEK RAW DATA DARI BRIDGE
-- ============================================================
SELECT '=== 7. source_ticket di ticket_raw ===' AS '';
SELECT source_ticket, sourceTable, COUNT(*) AS cnt
FROM ticket_raw WHERE isActive = TRUE
GROUP BY source_ticket, sourceTable
ORDER BY cnt DESC
LIMIT 20;

-- 8. CEK CLASSIFY-MISMATCH
-- ============================================================
SELECT '=== 8. CLASSIFY-MISMATCH pattern ===' AS '';
SELECT customer_segment, customer_type, service_type, COUNT(*) AS cnt
FROM ticket_raw
WHERE source_ticket = 'CUSTOMER' AND customer_segment = 'PL-TSEL'
GROUP BY customer_segment, customer_type, service_type
ORDER BY cnt DESC
LIMIT 20;
