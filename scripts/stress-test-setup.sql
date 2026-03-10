-- ================================================================
-- K6 Stress Test — Setup & Cleanup Scripts
-- ================================================================
-- Usage:
--   # Generate bcrypt hash for 'Password123!' with rounds=10
--   node -e "const b=require('bcryptjs');console.log(b.hashSync('Password123!',10))"
--   
--   # Run this script with the generated hash
--   mysql -u root -p dompis_db < scripts/stress-test-setup.sql
-- ================================================================

-- ================================================================
-- STEP 1: Generate Test Users
-- ================================================================
-- Replace $HASH below with the bcrypt hash from the node command above
-- Example: '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

SET @TEST_PASSWORD_HASH = '$2a$10$EXAMPLE_REPLACE_THIS_WITH_REAL_HASH';

-- Admin users (role_id = 2)
INSERT INTO users (username, password, nama, role_id, created_at, updated_at) VALUES
  ('stress_admin01', @TEST_PASSWORD_HASH, 'Stress Admin 01', 2, NOW(), NOW()),
  ('stress_admin02', @TEST_PASSWORD_HASH, 'Stress Admin 02', 2, NOW(), NOW()),
  ('stress_admin03', @TEST_PASSWORD_HASH, 'Stress Admin 03', 2, NOW(), NOW()),
  ('stress_admin04', @TEST_PASSWORD_HASH, 'Stress Admin 04', 2, NOW(), NOW()),
  ('stress_admin05', @TEST_PASSWORD_HASH, 'Stress Admin 05', 2, NOW(), NOW()),
  ('stress_admin06', @TEST_PASSWORD_HASH, 'Stress Admin 06', 2, NOW(), NOW()),
  ('stress_admin07', @TEST_PASSWORD_HASH, 'Stress Admin 07', 2, NOW(), NOW()),
  ('stress_admin08', @TEST_PASSWORD_HASH, 'Stress Admin 08', 2, NOW(), NOW()),
  ('stress_admin09', @TEST_PASSWORD_HASH, 'Stress Admin 09', 2, NOW(), NOW()),
  ('stress_admin10', @TEST_PASSWORD_HASH, 'Stress Admin 10', 2, NOW(), NOW());

-- Teknisi users (role_id = 3)
INSERT INTO users (username, password, nama, role_id, created_at, updated_at) VALUES
  ('stress_tek01', @TEST_PASSWORD_HASH, 'Stress Teknisi 01', 3, NOW(), NOW()),
  ('stress_tek02', @TEST_PASSWORD_HASH, 'Stress Teknisi 02', 3, NOW(), NOW()),
  ('stress_tek03', @TEST_PASSWORD_HASH, 'Stress Teknisi 03', 3, NOW(), NOW()),
  ('stress_tek04', @TEST_PASSWORD_HASH, 'Stress Teknisi 04', 3, NOW(), NOW()),
  ('stress_tek05', @TEST_PASSWORD_HASH, 'Stress Teknisi 05', 3, NOW(), NOW()),
  ('stress_tek06', @TEST_PASSWORD_HASH, 'Stress Teknisi 06', 3, NOW(), NOW()),
  ('stress_tek07', @TEST_PASSWORD_HASH, 'Stress Teknisi 07', 3, NOW(), NOW()),
  ('stress_tek08', @TEST_PASSWORD_HASH, 'Stress Teknisi 08', 3, NOW(), NOW()),
  ('stress_tek09', @TEST_PASSWORD_HASH, 'Stress Teknisi 09', 3, NOW(), NOW()),
  ('stress_tek10', @TEST_PASSWORD_HASH, 'Stress Teknisi 10', 3, NOW(), NOW()),
  ('stress_tek11', @TEST_PASSWORD_HASH, 'Stress Teknisi 11', 3, NOW(), NOW()),
  ('stress_tek12', @TEST_PASSWORD_HASH, 'Stress Teknisi 12', 3, NOW(), NOW()),
  ('stress_tek13', @TEST_PASSWORD_HASH, 'Stress Teknisi 13', 3, NOW(), NOW()),
  ('stress_tek14', @TEST_PASSWORD_HASH, 'Stress Teknisi 14', 3, NOW(), NOW()),
  ('stress_tek15', @TEST_PASSWORD_HASH, 'Stress Teknisi 15', 3, NOW(), NOW());

-- Helpdesk users (role_id = 4)
INSERT INTO users (username, password, nama, role_id, created_at, updated_at) VALUES
  ('stress_hd01', @TEST_PASSWORD_HASH, 'Stress Helpdesk 01', 4, NOW(), NOW()),
  ('stress_hd02', @TEST_PASSWORD_HASH, 'Stress Helpdesk 02', 4, NOW(), NOW()),
  ('stress_hd03', @TEST_PASSWORD_HASH, 'Stress Helpdesk 03', 4, NOW(), NOW()),
  ('stress_hd04', @TEST_PASSWORD_HASH, 'Stress Helpdesk 04', 4, NOW(), NOW()),
  ('stress_hd05', @TEST_PASSWORD_HASH, 'Stress Helpdesk 05', 4, NOW(), NOW());

-- Verify users created
SELECT 
  role_id,
  COUNT(*) as count,
  GROUP_CONCAT(username ORDER BY username) as usernames
FROM users
WHERE username LIKE 'stress_%'
GROUP BY role_id;

-- ================================================================
-- STEP 2: Get Fixture Ticket IDs for Pickup Test
-- ================================================================
-- These tickets should have STATUS_UPDATE = 'assigned' for pickup test
-- Copy the results to FIXTURE_TICKET_IDS in stress-test.js

SELECT 
  id_ticket,
  INCIDENT,
  STATUS_UPDATE,
  teknisi_user_id,
  WORKZONE
FROM ticket
WHERE STATUS_UPDATE = 'assigned'
  AND teknisi_user_id IS NOT NULL
ORDER BY REPORTED_DATE DESC
LIMIT 20;

-- ================================================================
-- STEP 3: Cleanup Script (Run After Test)
-- ================================================================
-- Execute this after the stress test is complete

-- Delete stress test users
-- DELETE FROM users WHERE username LIKE 'stress_%';

-- Reset tickets that were picked up during test (optional)
-- UPDATE ticket 
-- SET STATUS_UPDATE = 'assigned' 
-- WHERE id_ticket IN (/* fixture IDs */);

-- Verify cleanup
-- SELECT COUNT(*) as remaining_stress_users 
-- FROM users 
-- WHERE username LIKE 'stress_%';
