-- Audit diagnostik performa Dompis, versi 2 (18 November 2026)
--
-- READ-ONLY, aman saat produksi berjalan.
--
-- Jalankan dari server, pilih salah satu:
--   mysql -u root -p dompis_db < scripts/perf-audit-2026-11-18.sql
--   mysql -u root -p            (lalu di dalam klien: USE dompis_db; source ...)
--
-- Kenapa ada versi 2: run pertama dieksekusi tanpa database terpilih, jadi
-- DATABASE() bernilai NULL dan semua query information_schema /
-- performance_schema mengembalikan empty set. Versi ini memakai @schema
-- eksplisit dan menampilkan schema yang benar-benar diaudit di awal.

SET @schema := COALESCE(DATABASE(), 'dompis_db');

SELECT '=== 0. KONTEKS & LAJU SEJAK RESTART ===' AS section;

SELECT
  DATABASE()                                        AS connected_schema,
  @schema                                           AS audited_schema,
  @@hostname                                        AS host,
  @@port                                            AS port,
  @@version                                         AS version,
  ROUND(@@innodb_buffer_pool_size / 1024 / 1024 / 1024, 2) AS buffer_pool_gb,
  @@max_connections                                 AS max_connections;

SELECT
  ROUND(u / 3600, 1)                          AS uptime_hours,
  ROUND(conn / (u / 3600), 0)                 AS connections_per_hour,
  ROUND(aborted / (u / 3600), 0)              AS aborted_connects_per_hour,
  ROUND(created / (u / 3600), 0)              AS threads_created_per_hour,
  ROUND(rlw / (u / 3600), 0)                  AS row_lock_waits_per_hour,
  ROUND(rlt_ms / 1000 / (u / 3600), 1)        AS row_lock_seconds_per_hour,
  ROUND(rlt_ms / NULLIF(rlw, 0), 1)           AS row_lock_avg_ms,
  ROUND(100 * bp_reads / NULLIF(bp_reqs, 0), 3) AS buffer_pool_miss_pct,
  ROUND(bp_wait_free / (u / 3600), 0)         AS buffer_pool_wait_free_per_hour
FROM (
  SELECT
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Uptime' THEN VARIABLE_VALUE END) AS UNSIGNED) AS u,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Connections' THEN VARIABLE_VALUE END) AS UNSIGNED) AS conn,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Aborted_connects' THEN VARIABLE_VALUE END) AS UNSIGNED) AS aborted,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Threads_created' THEN VARIABLE_VALUE END) AS UNSIGNED) AS created,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Innodb_row_lock_waits' THEN VARIABLE_VALUE END) AS UNSIGNED) AS rlw,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Innodb_row_lock_time' THEN VARIABLE_VALUE END) AS UNSIGNED) AS rlt_ms,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Innodb_buffer_pool_reads' THEN VARIABLE_VALUE END) AS UNSIGNED) AS bp_reads,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Innodb_buffer_pool_read_requests' THEN VARIABLE_VALUE END) AS UNSIGNED) AS bp_reqs,
    CAST(MAX(CASE WHEN VARIABLE_NAME = 'Innodb_buffer_pool_wait_free' THEN VARIABLE_VALUE END) AS UNSIGNED) AS bp_wait_free
  FROM performance_schema.global_status
) t;

SELECT '=== 1. VERSI & TUNING ===' AS section;

SHOW VARIABLES WHERE Variable_name IN (
  'version',
  'innodb_buffer_pool_size',
  'innodb_buffer_pool_instances',
  'innodb_flush_method',
  'innodb_io_capacity',
  'innodb_io_capacity_max',
  'innodb_flush_log_at_trx_commit',
  'sync_binlog',
  'binlog_format',
  'innodb_log_file_size',
  'innodb_log_buffer_size',
  'innodb_redo_log_capacity',
  'table_open_cache',
  'tmp_table_size',
  'max_heap_table_size',
  'sort_buffer_size',
  'join_buffer_size',
  'max_connections',
  'innodb_strict_mode',
  'slow_query_log',
  'long_query_time',
  'transaction_isolation'
);

SELECT '=== 2. KONEKSI & CHURN ===' AS section;

SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Threads_running',
  'Threads_connected',
  'Threads_created',
  'Max_used_connections',
  'Aborted_connects',
  'Aborted_clients',
  'Connections',
  'Connection_errors_max_connections',
  'Connection_errors_internal',
  'Connection_errors_peer_address',
  'Connection_errors_accept'
);

SELECT '=== 3. UKURAN TABEL TERBESAR ===' AS section;

SELECT
  table_name,
  table_rows,
  ROUND(data_length / 1024 / 1024)  AS data_mb,
  ROUND(index_length / 1024 / 1024) AS index_mb,
  ROUND((data_length + index_length) / 1024 / 1024) AS total_mb,
  engine,
  row_format
FROM information_schema.tables
WHERE table_schema = @schema
ORDER BY (data_length + index_length) DESC
LIMIT 20;

SELECT '=== 4. INDEX PADA ticket & JUMLAH INDEX PER TABEL ===' AS section;

SELECT
  index_name,
  GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns,
  non_unique
FROM information_schema.statistics
WHERE table_schema = @schema
  AND table_name = 'ticket'
GROUP BY index_name, non_unique
ORDER BY index_name;

SELECT
  table_name,
  COUNT(DISTINCT index_name) AS index_count
FROM information_schema.statistics
WHERE table_schema = @schema
  AND table_name IN ('ticket', 'ticket_raw', 'ticket_projection_log', 'ticket_sync_state')
GROUP BY table_name;

SELECT '=== 5. INDEX YANG TIDAK PERNAH DIPAKAI (sejak restart) ===' AS section;

SELECT
  object_name AS table_name,
  index_name,
  count_star,
  count_read,
  count_write
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema = @schema
  AND object_name IN ('ticket', 'ticket_raw')
  AND index_name IS NOT NULL
  AND index_name <> 'PRIMARY'
  AND count_star = 0
ORDER BY object_name, index_name;

SELECT '=== 6. INDEX PALING SERING DIPAKAI ===' AS section;

SELECT
  object_name AS table_name,
  index_name,
  count_star,
  count_read,
  count_write
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema = @schema
  AND object_name IN ('ticket', 'ticket_raw')
  AND index_name IS NOT NULL
ORDER BY count_star DESC
LIMIT 25;

SELECT '=== 7. HOTSPOT LOCK (snapshot saat query) ===' AS section;

SELECT
  OBJECT_SCHEMA,
  OBJECT_NAME,
  INDEX_NAME,
  LOCK_TYPE,
  LOCK_MODE,
  LOCK_STATUS,
  COUNT(*) AS lock_count
FROM performance_schema.data_locks
GROUP BY OBJECT_SCHEMA, OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS
ORDER BY lock_count DESC
LIMIT 20;

SELECT
  REQUESTING_ENGINE_TRANSACTION_ID AS waiting_trx,
  BLOCKING_ENGINE_TRANSACTION_ID  AS blocking_trx
FROM performance_schema.data_lock_waits
LIMIT 20;

SELECT '=== 8. QUERY YANG SEDANG BERJALAN (> 2 detik) ===' AS section;

SELECT
  ID,
  USER,
  HOST,
  DB,
  COMMAND,
  TIME AS seconds,
  STATE,
  LEFT(INFO, 200) AS query_preview
FROM performance_schema.processlist
WHERE DB = @schema
  AND COMMAND <> 'Sleep'
  AND TIME > 2
ORDER BY TIME DESC;

SELECT '=== 9. BUFFER POOL ===' AS section;

SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Innodb_buffer_pool_reads',
  'Innodb_buffer_pool_read_requests',
  'Innodb_buffer_pool_wait_free',
  'Innodb_buffer_pool_pages_total',
  'Innodb_buffer_pool_pages_free',
  'Innodb_buffer_pool_pages_dirty',
  'Innodb_buffer_pool_pages_data',
  'Innodb_data_pending_reads',
  'Innodb_data_pending_writes',
  'Innodb_data_pending_fsyncs',
  'Innodb_log_waits',
  'Innodb_row_lock_current_waits',
  'Innodb_row_lock_waits',
  'Innodb_row_lock_time',
  'Innodb_row_lock_time_avg',
  'Innodb_row_lock_time_max'
);

SELECT '=== 10. TOP QUERY MENURUT TOTAL WAKTU ===' AS section;

SELECT
  DIGEST_TEXT,
  COUNT_STAR,
  ROUND(SUM_TIMER_WAIT / 1000000000000, 2) AS total_seconds,
  ROUND(AVG_TIMER_WAIT / 1000000000, 2) AS avg_ms,
  ROUND(MAX_TIMER_WAIT / 1000000000, 2) AS max_ms,
  SUM_ROWS_EXAMINED,
  SUM_ROWS_SENT
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = @schema
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 15;

SELECT '=== 11. TOP QUERY TANPA INDEX ===' AS section;

SELECT
  DIGEST_TEXT,
  COUNT_STAR,
  ROUND(AVG_TIMER_WAIT / 1000000000, 2) AS avg_ms,
  SUM_NO_INDEX_USED,
  SUM_ROWS_EXAMINED,
  SUM_ROWS_SENT
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = @schema
  AND SUM_NO_INDEX_USED > 0
ORDER BY SUM_NO_INDEX_USED DESC
LIMIT 15;

SELECT '=== 12. JUMLAH BARIS AKTUAL ===' AS section;

-- Lewat prepared statement supaya tetap jalan walau klien tidak memilih database
-- secara eksplisit (nama tabel tidak bisa diberi @variable langsung).
SET @sql := CONCAT(
  'SELECT ''ticket'' AS table_name, COUNT(*) AS exact_rows FROM `', @schema, '`.ticket ',
  'UNION ALL SELECT ''ticket_raw'', COUNT(*) FROM `', @schema, '`.ticket_raw'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
