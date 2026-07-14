# Plan: Index Overhaul + Diagnosa Bucket Customer + Fix Klasifikasi

## Masalah
1. Dashboard slow queries (6-15s) pada `ticket` table — ✅ **SELESAI** (add 3 index, drop 11 index usang)
2. `projection_request` query `ORDER BY created_at DESC LIMIT 1` 15s — ✅ **SELESAI**
3. Bucket customer kosong di dashboard — ✅ **TERDIAGNOSA**, fix sudah diimplementasi

---

## Ringkasan Eksekusi (15 Juli 2026)

### ✅ Index Overhaul — VPS
- **Add**: `idx_ticket_dashboard_main`, `idx_ticket_teknisi_dashboard`, `idx_projection_request_source_created`
- **Drop**: 11 index `sync_date`-prefix usang
- **Schema.prisma**: +2 index ticket, +1 index projection_request, -11 index sync_date

### ✅ Diagnosa Bucket Customer
**Temuan kunci:**
- 161.669 customer tickets di `ticket` table
- 41.388 punya `jenis_tiket_1 = NULL` (classifier lama)
- 34.555 terklasifikasi `PERMINTAAN` (exclude dari kpi_customer)
- 121.391 unprojected rows di backlog
- Pola dominan NULL: `PL-TSEL + HVC_GOLD/REGULER + INTERNET` (31.673 rows)

**Akar masalah:** B2C path (`classifyB2C`) gagal karena `channel` tidak match di `source_vlookup`. Tidak ada fallback untuk service_type INTERNET/VOICE/IPTV.

### ✅ Fix Implementasi — Kode
1. **`lib/classify-jenis-vlookup.ts`**: Tambah fallback di `classifyB2C()` — jika channel lookup gagal untuk B2C dengan service_type INTERNET/VOICE/IPTV, set `jenis_tiket_1 = 'REGULER'`
2. **`scripts/backfill-jenis-tiket.ts`**: One-shot script untuk re-klasifikasi 41K rows NULL
3. **`package.json`**: Tambah script `backfill:jenis-tiket`

---

## Yang Perlu Dieksekusi di VPS

```bash
# 1. Deploy kode terbaru
git pull && npm run build && pm2 startOrReload ecosystem.config.js --update-env && pm2 save

# 2. Hapus pending request import-tiket yang stuck
mysql -u root -p dompis_db -e "UPDATE projection_request SET processed_at = NOW() WHERE id = 12554 AND processed_at IS NULL;"

# 3. Jalankan backfill jenis_tiket (fix 41K NULL rows)
npx tsx scripts/backfill-jenis-tiket.ts

# 4. Trigger projection untuk 121K backlog
mysql -u root -p dompis_db -e "INSERT INTO projection_request (source) VALUES ('post-backfill');"
```
