# Plan: Index Overhaul + Diagnosa Bucket Customer

## Masalah
1. Dashboard slow queries (6-15s) pada `ticket` table — 11 index `sync_date`-prefix tidak terpakai, tidak ada index cocok pola filter baru `(workzone + status/closed_at/pending_dompis)`
2. `projection_request` query `ORDER BY created_at DESC LIMIT 1` 15s — tidak ada index
3. Bucket customer kosong di dashboard

## Rencana A: Index Overhaul

### Drop (11 index usang — dashboard tidak lagi pakai `sync_date`)

```sql
DROP INDEX idx_ctype_sync ON ticket;
DROP INDEX idx_pending_sync ON ticket;
DROP INDEX idx_ticket_daily_sync_status_reported ON ticket;
DROP INDEX idx_sync_status ON ticket;
DROP INDEX idx_sync_workzone ON ticket;
DROP INDEX idx_ticket_autoassign_daily ON ticket;
DROP INDEX idx_sync_date_jenis1 ON ticket;
DROP INDEX idx_ops_sync_ctype_status ON ticket;
DROP INDEX idx_ops_sync_ctype_jenis2 ON ticket;
DROP INDEX idx_ticket_daily_board ON ticket;
DROP INDEX idx_ticket_daily_validasi ON ticket;
```

Keep `idx_sync_date` (mungkin dipakai admin/search queries lain).

### Add (3 index baru)

```sql
-- P1: Universal dashboard pattern (workzone + status/closed_at/pending)
CREATE INDEX idx_ticket_dashboard_main 
ON ticket (workzone, status, status_update, closed_at);

-- P2: Teknisi dashboard
CREATE INDEX idx_ticket_teknisi_dashboard
ON ticket (teknisi_user_id, status, status_update, closed_at);

-- P3: Fix 15s query di last-upload API
CREATE INDEX idx_projection_request_source_created
ON projection_request (source, sync_batch_id, created_at DESC);
```

### Sync schema.prisma

Tambahkan 3 index baru ke model `ticket` dan 1 index ke model `projection_request`.

---

## Rencana B: Diagnosa Bucket Customer

Jalankan query berikut di VPS untuk cari tahu penyebabnya:

### Step 1 — Cek data dasar
```sql
SELECT DISTINCT source_ticket FROM ticket;
SELECT COUNT(*) FROM ticket WHERE LOWER(source_ticket) = 'customer';
```

### Step 2 — Cek klasifikasi jenis_tiket
```sql
SELECT jenis_tiket_1, COUNT(*) 
FROM ticket WHERE LOWER(source_ticket) = 'customer'
GROUP BY jenis_tiket_1 ORDER BY COUNT(*) DESC;
```

### Step 3 — Cek non-technical exclusion
```sql
SELECT classification_flag, jenis_tiket_1, jenis_tiket_2
FROM ticket WHERE LOWER(source_ticket) = 'customer'
  AND (classification_flag LIKE '%nontech%' 
    OR jenis_tiket_1 LIKE '%unknown%' 
    OR jenis_tiket_1 IS NULL)
LIMIT 20;
```

### Step 4 — Cek projection lag
```sql
SELECT COUNT(*) FROM ticket_raw tr
WHERE tr.isActive = TRUE AND tr.importedAt IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ticket_projection_log tpl
    WHERE tpl.ticketRawId = tr.id_ticket AND tpl.status = 'success'
  );
```

### Step 5 — Cek daily filter exclusion
```sql
SELECT status, closed_at, sync_date, reported_date 
FROM ticket WHERE LOWER(source_ticket) = 'customer' 
LIMIT 20;
```

---

## Execution Order

1. **Run Step B1-B5** — diagnose penyebab bucket kosong
2. **Add 3 index baru** (Rencana A) — non-disruptif
3. **Drop 11 index usang** — setelah yakin aman
4. **Sync schema.prisma** + buat migration file
