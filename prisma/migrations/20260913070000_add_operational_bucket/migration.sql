-- Materialize the operational-bucket / seg classification used by the
-- dashboard KPI summary queries (app/libs/services/kpi-bucket-sql.ts,
-- app/libs/services/daily-ticket-kpi-matrix.ts). Those queries evaluate
-- dozens of LOWER()/TRIM()/REPLACE()/LIKE expressions per row on every
-- request (10-30s+ on the full `ticket` table) because none of that can be
-- served by a normal index.
--
-- Fix: STORED GENERATED COLUMNS computed from the exact same expressions
-- (extracted verbatim from buildKpiBucketFilterSql()/SEG_SQL so there is
-- zero risk of drifting from the existing runtime logic). MySQL recomputes
-- these automatically on every INSERT/UPDATE regardless of which code path
-- writes the row (projection, manual ticket edits via
-- app/api/tickets/update, backfill scripts, etc) — no app-side dual-write
-- code needed, and no separate backfill: ALTER TABLE computes the value for
-- every existing row as part of the rebuild below.
--
-- Precedence for `operational_bucket` (first match wins, mirrors
-- OPERATIONAL_BUCKET_DEFINITIONS order with `obsolete` checked first since
-- every other bucket's condition already excludes it):
--   obsolete -> kpi_customer -> kpi_proactive -> non_kpi_unspec ->
--   sqm_update -> non_technical -> NULL (no bucket matched)
--
-- Same ALGORITHM=COPY/LOCK=SHARED reasoning as
-- 20260912030000_add_reported_date_dt (ticket has a FULLTEXT index, which
-- blocks ALGORITHM=INSTANT for any ALTER on this table).
ALTER TABLE `ticket`
  ADD COLUMN `operational_bucket` VARCHAR(20) GENERATED ALWAYS AS (
    CASE
      WHEN `classification_path` = 'Z_PERMINTAAN_044' THEN 'obsolete'
      WHEN LOWER(`source_ticket`) = 'customer'
        AND (`classification_path` IS NULL OR `classification_path` != 'Z_PERMINTAAN_044')
        AND NOT (
          LOWER(`jenis_tiket_1`) LIKE '%unknown%'
          OR LOWER(`jenis_tiket_2`) LIKE '%unknown%'
          OR LOWER(`classification_flag`) LIKE '%nontechnical%'
          OR LOWER(`classification_flag`) LIKE '%non technical%'
          OR LOWER(`classification_flag`) LIKE '%billing%'
          OR LOWER(`jenis_tiket_1`) LIKE '%permintaan%'
          OR LOWER(`jenis_tiket_1`) LIKE '%billing%'
          OR LOWER(`jenis_tiket_1`) LIKE '%infracare%'
          OR LOWER(`jenis_tiket_1`) LIKE '%digital_spbu%'
          OR LOWER(`jenis_tiket_1`) LIKE '%digital spbu%'
          OR LOWER(`jenis_tiket_2`) LIKE '%digital_spbu%'
          OR LOWER(`jenis_tiket_2`) LIKE '%digital spbu%'
        )
        AND (
          LOWER(`jenis_tiket_1`) LIKE '%reguler%' OR LOWER(`jenis_tiket_1`) LIKE '%datin%'
          OR LOWER(`jenis_tiket_1`) LIKE '%non datin%' OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%nondatin%'
          OR LOWER(`jenis_tiket_1`) LIKE '%tsel%' OR LOWER(`jenis_tiket_1`) LIKE '%vpn ip%'
          OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%vpnip%' OR LOWER(`jenis_tiket_1`) LIKE '%ccan%'
          OR LOWER(`jenis_tiket_1`) LIKE '%regular%' OR LOWER(`jenis_tiket_1`) LIKE '%dwdm%'
          OR LOWER(`jenis_tiket_1`) LIKE '%digital_spbu%' OR LOWER(`jenis_tiket_1`) LIKE '%digital spbu%'
          OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%digitalspbu%' OR LOWER(`jenis_tiket_1`) LIKE '%astinet%'
          OR LOWER(`jenis_tiket_1`) LIKE '%metro-e%' OR LOWER(`jenis_tiket_1`) LIKE '%indibiz%'
          OR LOWER(`jenis_tiket_1`) LIKE '%reseller%' OR LOWER(`jenis_tiket_1`) LIKE '%wifi-id%'
        ) THEN 'kpi_customer'
      WHEN LOWER(`source_ticket`) = 'proactive'
        AND (`classification_path` IS NULL OR `classification_path` != 'Z_PERMINTAAN_044')
        AND NOT (`sqm_update_reason` IS NOT NULL AND TRIM(`sqm_update_reason`) <> '')
        AND (LOWER(`jenis_tiket_1`) LIKE '%sqm%' OR LOWER(`jenis_tiket_1`) LIKE '%sqm-ccan%') THEN 'kpi_proactive'
      WHEN LOWER(`source_ticket`) = 'proactive'
        AND (`classification_path` IS NULL OR `classification_path` != 'Z_PERMINTAAN_044')
        AND `jenis_tiket_2` IN ('unspec','UNSPEC','unspecified','UNSPECIFIED','unspec-b2b','UNSPEC-B2B','unspec_b2b','UNSPEC_B2B','UNSPEC B2B','unspec b2b') THEN 'non_kpi_unspec'
      WHEN LOWER(`source_ticket`) = 'proactive'
        AND (`classification_path` IS NULL OR `classification_path` != 'Z_PERMINTAAN_044')
        AND (`sqm_update_reason` IS NOT NULL AND TRIM(`sqm_update_reason`) <> '')
        AND (LOWER(`jenis_tiket_1`) LIKE '%sqm%' OR LOWER(`jenis_tiket_1`) LIKE '%sqm-ccan%') THEN 'sqm_update'
      WHEN (`classification_path` IS NULL OR `classification_path` != 'Z_PERMINTAAN_044')
        AND (
          (
            LOWER(`source_ticket`) IN ('customer','proactive') AND (
              LOWER(`classification_flag`) LIKE '%nontechnical%'
              OR LOWER(`classification_flag`) LIKE '%non technical%'
              OR LOWER(`classification_flag`) LIKE '%billing%'
              OR LOWER(`jenis_tiket_1`) LIKE '%unknown%'
              OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%unknown%'
              OR LOWER(`jenis_tiket_1`) LIKE '%permintaan%'
              OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%permintaan%'
              OR LOWER(`jenis_tiket_1`) LIKE '%infracare%'
              OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%infracare%'
              OR LOWER(`jenis_tiket_1`) LIKE '%billing%'
              OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%billing%'
              OR LOWER(`jenis_tiket_1`) LIKE '%digital_spbu%'
              OR LOWER(`jenis_tiket_1`) LIKE '%digital spbu%'
              OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%digitalspbu%'
              OR LOWER(`jenis_tiket_1`) LIKE '%non numbering%'
              OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%nonnumbering%'
              OR LOWER(`jenis_tiket_2`) LIKE '%digital_spbu%'
              OR LOWER(`jenis_tiket_2`) LIKE '%digital spbu%'
              OR REPLACE(LOWER(`jenis_tiket_2`), ' ', '') LIKE '%digitalspbu%'
              OR LOWER(`jenis_tiket_2`) LIKE '%unknown%'
              OR REPLACE(LOWER(`jenis_tiket_2`), ' ', '') LIKE '%unknown%'
              OR LOWER(`symptom`) LIKE '%z_nn_01_001%'
            )
          )
          OR `jenis_tiket_1` IS NULL
          OR `jenis_tiket_1` = ''
          OR `jenis_tiket_1` = ' '
          OR LOWER(`jenis_tiket_1`) LIKE '%unknown%'
          OR REPLACE(LOWER(`jenis_tiket_1`), ' ', '') LIKE '%unknown%'
          OR LOWER(`jenis_tiket_2`) LIKE '%digital_spbu%'
          OR LOWER(`jenis_tiket_2`) LIKE '%digital spbu%'
          OR REPLACE(LOWER(`jenis_tiket_2`), ' ', '') LIKE '%digitalspbu%'
          OR LOWER(`jenis_tiket_2`) LIKE '%unknown%'
          OR REPLACE(LOWER(`jenis_tiket_2`), ' ', '') LIKE '%unknown%'
        ) THEN 'non_technical'
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN `kpi_seg` VARCHAR(10) GENERATED ALWAYS AS (
    CASE
      WHEN LOWER(TRIM(REPLACE(REPLACE(COALESCE(`jenis_tiket_2`,''),' ','-'),'_','-'))) IN ('unknown','digital-spbu','non-numbering','billing','infracare') THEN 'netral'
      WHEN LOWER(TRIM(COALESCE(`jenis_tiket_2`,'')))='permintaan' THEN (CASE WHEN `customer_segment` IN ('DCS','PL-TSEL') THEN 'b2c' ELSE 'b2b' END)
      WHEN LOWER(TRIM(REPLACE(REPLACE(COALESCE(`jenis_tiket_2`,''),' ','-'),'_','-'))) IN ('reguler','hvc','sqm','unspec') THEN 'b2c'
      ELSE 'b2b'
    END
  ) STORED,
  ALGORITHM=COPY, LOCK=SHARED;

ALTER TABLE `ticket`
  ADD INDEX `idx_ticket_operational_bucket` (`workzone`, `operational_bucket`, `status`, `status_update`, `closed_at`),
  ALGORITHM=INPLACE, LOCK=NONE;
