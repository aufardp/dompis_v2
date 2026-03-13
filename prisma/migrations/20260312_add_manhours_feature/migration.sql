-- Migration: Add ManHours feature support
-- Date: 2026-03-12
-- Description: Add working_hours column to technician_attendance and create manhours_config table

-- 1. Add working_hours column to technician_attendance
ALTER TABLE technician_attendance
  ADD COLUMN working_hours DECIMAL(5,2) NULL AFTER check_out_at;

-- 2. Backfill existing data - calculate working_hours from check_in and check_out times
UPDATE technician_attendance
  SET working_hours = ROUND(TIMESTAMPDIFF(SECOND, check_in_at, check_out_at) / 3600.0, 2)
  WHERE check_out_at IS NOT NULL AND working_hours IS NULL;

-- 3. Create manhours_config table for scalable manhour configuration
CREATE TABLE manhours_config (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  jenis_key   VARCHAR(50) NOT NULL UNIQUE,
  label       VARCHAR(100) NOT NULL,
  manhours    DECIMAL(4,2) NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  TINYINT DEFAULT 0,
  created_at  DATETIME DEFAULT NOW(),
  updated_at  DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed initial manhour configuration data
INSERT INTO manhours_config (jenis_key, label, manhours, sort_order) VALUES
  ('sqm',          'SQM',                     2.0, 1),
  ('reguler',      'Gangguan Reguler',         2.0, 2),
  ('datin',        'DATIN',                    2.0, 3),
  ('non-datin',    'Non DATIN',                2.0, 4),
  ('exbis',        'ExBis / Indibiz',          2.0, 5),
  ('psb',          'PSB B2C',                  5.3, 6),
  ('psb-b2b',      'PSB B2B',                  5.3, 7),
  ('tangible-odp', 'Tangible ODP',             4.0, 8),
  ('tangible-odc', 'Tangible ODC',             8.0, 9),
  ('infracare',    'Infracare',                2.0, 10),
  ('unspec',       'Unspec',                   2.0, 11);

-- 5. Create index for faster lookups
CREATE INDEX idx_manhours_config_active ON manhours_config(is_active, sort_order);
