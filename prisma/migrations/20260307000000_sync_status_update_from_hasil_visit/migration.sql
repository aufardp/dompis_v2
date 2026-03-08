-- Migration: Sync STATUS_UPDATE from HASIL_VISIT
-- Date: 2026-03-07
-- Purpose: Make STATUS_UPDATE the single source of truth for ticket workflow
-- 
-- This migration:
-- 1. Syncs STATUS_UPDATE values from HASIL_VISIT where STATUS_UPDATE is empty/null
-- 2. Ensures all tickets have a valid STATUS_UPDATE value

-- Step 1: Sync STATUS_UPDATE from HASIL_VISIT where STATUS_UPDATE is NULL or empty
UPDATE ticket 
SET STATUS_UPDATE = CASE 
  WHEN HASIL_VISIT = 'OPEN' OR HASIL_VISIT IS NULL OR TRIM(HASIL_VISIT) = '' THEN 'open'
  WHEN HASIL_VISIT = 'ASSIGNED' THEN 'assigned'
  WHEN HASIL_VISIT = 'ON_PROGRESS' OR HASIL_VISIT = 'IN_PROGRESS' THEN 'on_progress'
  WHEN HASIL_VISIT = 'PENDING' THEN 'pending'
  WHEN HASIL_VISIT = 'ESCALATED' THEN 'escalated'
  WHEN HASIL_VISIT IN ('CLOSE', 'CLOSED', 'DONE') THEN 'closed'
  WHEN LOWER(HASIL_VISIT) = 'open' THEN 'open'
  WHEN LOWER(HASIL_VISIT) = 'assigned' THEN 'assigned'
  WHEN LOWER(HASIL_VISIT) = 'on_progress' THEN 'on_progress'
  WHEN LOWER(HASIL_VISIT) = 'pending' THEN 'pending'
  WHEN LOWER(HASIL_VISIT) = 'escalated' THEN 'escalated'
  WHEN LOWER(HASIL_VISIT) IN ('close', 'closed', 'done') THEN 'closed'
  ELSE COALESCE(STATUS_UPDATE, 'open')
END
WHERE STATUS_UPDATE IS NULL OR TRIM(STATUS_UPDATE) = '';

-- Step 2: Create index on STATUS_UPDATE for faster aggregations (if not exists)
-- Note: This index already exists based on schema.prisma line 116
-- CREATE INDEX IF NOT EXISTS idx_status_update ON ticket(STATUS_UPDATE);

-- Step 3: Create index on computed classification columns (for faster B2B/B2C queries)
-- These will be used in the aggregation queries
-- CREATE INDEX IF NOT EXISTS idx_customer_segment ON ticket(CUSTOMER_SEGMENT);
-- CREATE INDEX IF NOT EXISTS idx_customer_type ON ticket(CUSTOMER_TYPE);
-- CREATE INDEX IF NOT EXISTS idx_jenis_tiket_classification ON ticket(JENIS_TIKET);
