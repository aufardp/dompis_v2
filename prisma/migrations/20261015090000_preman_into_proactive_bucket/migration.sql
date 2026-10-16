-- Masukkan jenis PREMAN ke bucket `kpi_proactive`.
--
-- Latar: rule klasifikasi baru (lib/classify-jenis-vlookup.ts →
-- checkPremanOverride) menetapkan jenis_tiket_1 = jenis_tiket_2 = 'PREMAN'
-- untuk tiket proactive maintenance yang summary-nya mengandung kata
-- "preman" ("[PROACTIVE PREMAN 3]", "PROACTIVE | PREMAN_P1 |", dst).
--
-- Tanpa perubahan di sini `operational_bucket` tiket-tiket itu bernilai
-- NULL: tidak cocok kpi_customer (source_ticket bukan 'customer'), tidak
-- cocok kpi_proactive (syarat lama: jenis harus SQM/SQM-CCAN), dan tidak
-- cocok non_technical — karena kondisi bucket itu menyertakan
-- jenis_tiket LIKE '%unknown%', yang memang benar sebelum jenisnya diubah
-- menjadi PREMAN. Akibatnya tiket hilang dari seluruh bucket, termasuk di
-- Ticket Management.
--
-- Syarat `source_ticket = 'proactive'` sengaja TIDAK ikut dipakai untuk
-- PREMAN. Dari 1.492 tiket PREMAN hanya 1.244 yang punya
-- source_ticket = 'PROACTIVE'; sisanya NULL meski summary-nya jelas menulis
-- "PROACTIVE" — itu celah kualitas data di kolom tersebut. Jenis PREMAN
-- sudah merupakan sinyal proactive yang cukup, jadi dipakai sendiri
-- tanpa bergantung source_ticket.
--
-- Precedence tidak berubah — blok PREMAN disisipkan tepat sebelum
-- kpi_proactive, dan `obsolete` tetap diperiksa paling awal sehingga tiket
-- obsolete tidak ikut tertangkap.
--
-- Kolom ini STORED GENERATED, jadi MySQL menghitung ulang nilainya untuk
-- setiap baris existing selama rebuild di bawah; tidak perlu backfill
-- terpisah. Ekspresi kembarnya ada di app/libs/technician-bucket.ts
-- (classifyTechnicianBucket) — keduanya harus tetap sinkron.
--
-- ALGORITHM=COPY/LOCK=SHARED mengikuti reasoning migration
-- 20260913070000_add_operational_bucket: `ticket` punya FULLTEXT index yang
-- memblokir ALGORITHM=INSTANT, dan rebuild kolom generated selalu butuh COPY.
ALTER TABLE `ticket`
  MODIFY COLUMN `operational_bucket` VARCHAR(20) GENERATED ALWAYS AS (
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
      WHEN (LOWER(`jenis_tiket_1`) LIKE '%preman%' OR LOWER(`jenis_tiket_2`) LIKE '%preman%')
        AND (`classification_path` IS NULL OR `classification_path` != 'Z_PERMINTAAN_044') THEN 'kpi_proactive'
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
  ALGORITHM=COPY, LOCK=SHARED;
