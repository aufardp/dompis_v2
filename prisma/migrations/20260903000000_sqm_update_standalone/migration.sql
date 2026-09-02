-- SQM Update jadi mandiri: penanda = `ticket.sqm_update_reason` terisi
-- (tahan re-sync nossa), bukan lagi prefix `[SQM-UPDATE]` di `summary`.

-- 1) Lebarkan kolom supaya muat "[KODE] penjabaran" (kode s/d ~30 char + 255).
ALTER TABLE `ticket` MODIFY `sqm_update_reason` VARCHAR(300) NULL;

-- 2) Backfill: gabungkan KODE dari headline summary lama ke dalam kolom,
--    untuk tiket ber-headline [SQM-UPDATE] yang kolomnya belum berformat
--    "[KODE] ...". Tiket yang kolomnya sudah terisi teks bebas (mis. karena
--    headline sudah hilang oleh re-sync) tidak disentuh — tetap ter-flag
--    karena IS NOT NULL.
UPDATE `ticket`
SET `sqm_update_reason` = LEFT(
      CONCAT(
        '[',
        CASE
          WHEN `summary` LIKE '[SQM-UPDATE][%]%'
            THEN SUBSTRING_INDEX(SUBSTRING_INDEX(`summary`, ']', 2), '[', -1)
          ELSE 'SQM'
        END,
        '] ',
        COALESCE(`sqm_update_reason`, '')
      ),
      300
    )
WHERE `summary` LIKE '[SQM-UPDATE]%'
  AND (`sqm_update_reason` IS NULL OR `sqm_update_reason` NOT LIKE '[%] %');
