-- ============================================================
-- Phase 9: Increase GLOBAL max_execution_time dari 5000 ke 15000
-- ============================================================
-- Alasan: Tahap 1 set GLOBAL = 5000, tapi terlalu agresif —
-- query valid yang butuh 6-12s di-kill random, menyebabkan
-- Error 3024 pada dashboard & API.
--
-- Nilai 15000 memberikan waktu cukup untuk:
-- - 6-column GROUP BY analytics queries (10-25s → masih kadang
--   kena kill, tapi sudah diganti raw SQL dgn MAX_EXECUTION_TIME 30000)
-- - Dashboard queries complex (2-5s → aman)
-- - Correlated subquery (3-7s → aman setelah index Tahap 2)
--   
-- Perintah ini hanya mengubah GLOBAL (berlaku untuk semua koneksi
-- baru sejak dijalankan). SESSION per-query di-set via optimizer
-- hint /*+ MAX_EXECUTION_TIME(15000) */ di raw SQL.
-- ============================================================

SET GLOBAL max_execution_time = 15000;
