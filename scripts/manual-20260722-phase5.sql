-- ============================================================
-- Phase 5 — Pool Exhaustion Final Fix
-- Eksekusi manual via phpMyAdmin
-- ============================================================

-- ============================================================
-- STEP 1: Set global max_execution_time = 30s
-- MySQL 5.7.8+ will kill any query running >30s,
-- freeing up the connection back to the pool immediately.
-- ============================================================
SET GLOBAL max_execution_time = 30000;

-- ============================================================
-- VERIFIKASI
-- ============================================================
-- SHOW VARIABLES LIKE 'max_execution_time';
