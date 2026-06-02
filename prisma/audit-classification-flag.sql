-- ============================================================
-- Audit Classification Flag
-- Mengecek apakah classification_flag sudah terisi dengan benar
-- di tabel ticket_raw dan ticket
-- ============================================================

-- 1. Ringkasan ticket_raw
SELECT 
  'ticket_raw' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(classification_flag) AS filled,
  SUM(CASE WHEN classification_flag IS NULL OR classification_flag = '' THEN 1 ELSE 0 END) AS empty_or_null,
  COUNT(DISTINCT classification_flag) AS distinct_values
FROM ticket_raw;

-- 2. Distinct values di ticket_raw
SELECT DISTINCT classification_flag FROM ticket_raw ORDER BY classification_flag;

-- 3. Ringkasan ticket
SELECT 
  'ticket' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(classification_flag) AS filled,
  SUM(CASE WHEN classification_flag IS NULL OR classification_flag = '' THEN 1 ELSE 0 END) AS empty_or_null,
  COUNT(DISTINCT classification_flag) AS distinct_values
FROM ticket;

-- 4. Distinct values di ticket
SELECT DISTINCT classification_flag FROM ticket ORDER BY classification_flag;

-- 5. Sample 10 baris ticket_raw — cek kolom relevan untuk KPI
SELECT 
  incident,
  source_ticket,
  classification_flag,
  classification_path,
  status,
  customer_segment,
  channel,
  workzone,
  importedAt
FROM ticket_raw
ORDER BY importedAt DESC
LIMIT 10;

-- 6. Sample 10 baris ticket — cek apakah classification_flag sudah terproyeksi
SELECT 
  incident,
  source_ticket,
  classification_flag,
  classification_path,
  status,
  customer_segment,
  channel,
  workzone
FROM ticket
ORDER BY synced_at DESC
LIMIT 10;

-- 7. Hitung potensi KPI Customer di ticket_raw
SELECT
  COUNT(*) AS potential_kpi_customer_raw
FROM ticket_raw
WHERE source_ticket = 'CUSTOMER'
  AND classification_flag = 'TECHNICAL'
  AND status IN ('ANALYSIS','BACKEND','DRAFT','FINALCHECK','PENDING')
  AND customer_segment IN ('RBS','DGS','DES','DBS','DSS','DPS','REG','DWS','DCS','PL-TSEL')
  AND workzone IN ('DMO','GBG','IJK','JBR','JBT','JTG','JTM','KDS','KLT','KNG','KPY','KRS','MLG','MNG','MTH','NDL','PBL','PDG','PKL','PLS','PML','PNG','PNS','PRB','PRK','PWK','SBI','SDA','SDE','SGT','SKR','SLO','SMD','SMT','SMS','SPT','SRG','STB','SWG','TGL','TGR','TPI','TRG','WSP');

-- 8. Hitung potensi KPI Customer di ticket (sudah terproyeksi)
SELECT
  COUNT(*) AS potential_kpi_customer_ticket
FROM ticket
WHERE source_ticket = 'CUSTOMER'
  AND classification_flag = 'TECHNICAL'
  AND status IN ('ANALYSIS','BACKEND','DRAFT','FINALCHECK','PENDING')
  AND customer_segment IN ('RBS','DGS','DES','DBS','DSS','DPS','REG','DWS','DCS','PL-TSEL')
  AND workzone IN ('DMO','GBG','IJK','JBR','JBT','JTG','JTM','KDS','KLT','KNG','KPY','KRS','MLG','MNG','MTH','NDL','PBL','PDG','PKL','PLS','PML','PNG','PNS','PRB','PRK','PWK','SBI','SDA','SDE','SGT','SKR','SLO','SMD','SMT','SMS','SPT','SRG','STB','SWG','TGL','TGR','TPI','TRG','WSP');

-- 9. Cek baris yg classification_flag != TECHNICAL di ticket_raw
SELECT
  classification_flag,
  COUNT(*) AS cnt
FROM ticket_raw
WHERE classification_flag IS NOT NULL AND classification_flag != ''
GROUP BY classification_flag
ORDER BY cnt DESC;

-- 10. Cek apakah ada data yg classification_path mengandung TECHNICAL tapi classification_flag kosong
SELECT COUNT(*) AS path_technical_but_flag_empty
FROM ticket_raw
WHERE (classification_path LIKE '%TECHNICAL%' OR classification_path LIKE '%technical%')
  AND (classification_flag IS NULL OR classification_flag = '');
