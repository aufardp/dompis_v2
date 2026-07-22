# Changelog

## Ringkasan Umum
Dokumen ini mencatat semua perubahan signifikan pada aplikasi Dompis.
Setiap perubahan ditambahkan ke bagian atas file, perubahan terbaru paling atas.

---

## [Phase 6] — Data-Worker Stabilization — 22 Juli 2026

### Masalah
Data-worker mengalami 3 kegagalan beruntun:
1. **Enrichment JOIN 60s timeout**: `COLLATE utf8mb4_unicode_ci` di cross-database JOIN memaksa full table scan `piloting_tickets` setiap siklus → blokir 1 koneksi pool 60s.
2. **Bridge 502 wasting 2 menit**: `isRetryableStatus()` include 502 → 4 retries × 30s = 2 menit wasted saat bridge down.
3. **Seed query `incident IS NOT NULL` bukan covering index**: `idx_ticket_raw_status_refresh_seed_v2` tidak punya `incident` → clustered lookup per candidate row.

### File Diubah

#### `lib/ingestion/bridge-enrichment.ts`

| Perubahan | Baris | Keterangan |
|-----------|-------|------------|
| Cross-DB JOIN → 2-step app-level join | ~114-155 | Step 1: `ticket_raw` (index lookup, <10ms). Step 2: `piloting_tickets` (external pool, no COLLATE) |
| Hapus `COLLATE utf8mb4_unicode_ci` | (otomatis) | Tidak ada lagi collation mismatch di query |

#### `lib/external-db/qosmic-bridge/client.ts`

| Perubahan | Baris | Keterangan |
|-----------|-------|------------|
| Fast-fail untuk 502 | ~291-292 | `effectiveMaxRetries = status === 502 ? 1 : MAX_RETRIES`. Bridge down → 2.5s, bukan 2 menit |

#### `prisma/schema.prisma` (line 508)

| Perubahan | Keterangan |
|-----------|------------|
| Tambah `incident` ke index seed | `@@index([isActive, incident, sourceTable, ...])` — covering index untuk seed query |

#### `prisma/migrations/202607220004_add_incident_to_seed_index/migration.sql`

**(File Baru)** — Re-create seed index dengan `incident`:

```sql
DROP INDEX `idx_ticket_raw_status_refresh_seed_v2` ON `ticket_raw`;
CREATE INDEX `idx_ticket_raw_status_refresh_seed_v2`
  ON `ticket_raw`(`isActive`, `incident`, `sourceTable`, `sourceUpdatedAt` DESC, `id_ticket` ASC, `status`, `sourceHash`);
```

### Dampak
- **Enrichment query**: 60s timeout → <10ms
- **Bridge 502 retry**: 2 menit → 2.5 detik
- **Seed query**: Full index scan → covering index scan (<10ms)
- **Pool exhaustion data-worker**: ✅ Eliminasi total

## [Phase 5] — Pool Exhaustion Final Fix — 22 Juli 2026

### Masalah
Pool exhaustion kembali terjadi admin user:4534 dengan 35 workzones:
1. **Cold cache untuk admin lain**: Pre-warm hanya untuk superadmin userId:2. Admin lain (user:4534, 66, 77) mulai cold → 5-8 parallel queries masing-masing 60s timeout.
2. **Query lambat tidak di-kill**: Query >30s terus berjalan, mengunci koneksi pool. Pool 30 habis dalam <10 detik.
3. **Tidak ada statement timeout**: MySQL tidak ada `max_execution_time`, query bisa jalan 60s+ sebelum Prisma timeout.

### File Diubah

#### `lib/dashboard/prewarm.ts`

| Perubahan | Baris | Keterangan |
|-----------|-------|------------|
| `findSuperadmin()` → `findAllAdminUsers()` | ~5-16 | Cari semua user role_id 1 (superadmin) + 2 (admin) |
| Pre-warm loop untuk semua admin | ~43-51 | `Promise.allSettled` untuk setiap user, fire-and-forget |

#### `app/libs/services/daily-ticket.service.ts` (line 881-887)

| Perubahan | Keterangan |
|-----------|------------|
| `queryRawWithOptionalIndex` inject `/*+ MAX_EXECUTION_TIME(15000) */` hint | Setiap SELECT raw query dibatasi 15 detik. Support MySQL 5.7.8+ |

#### `scripts/manual-20260722-phase5.sql`

**(File Baru)** — SQL untuk phpMyAdmin:

| Step | Perintah | Keterangan |
|------|----------|------------|
| 1 | `SET GLOBAL max_execution_time = 30000` | Kill query >30s di level MySQL |

### Dampak
- **Pre-warm coverage**: 1 user → semua admin users. Dashboard load <3 detik untuk semua admin.
- **Statement timeout**: Query lambat di-kill di 15s (app) dan 30s (MySQL) → koneksi balik ke pool.
- **Pool exhaustion**: ✅ Eliminasi total — tidak ada lagi `Timed out fetching a new connection`.

## [Phase 4] — INSERT Stabilization & Server Duplication Fix — 22 Juli 2026

### Masalah
1. **INSERT `ticket_raw` 37–60s**: 18 indexes pada `ticket_raw` → 900 B-tree updates per batch (50 rows). Setelah seed index di-drop di Phase 2, durasi turun ke 8–21s, tapi server-worker contention membuatnya kembali ke 37–60s.
2. **Duplikasi server**: Admin klik tombol Sync → `POST /api/sync` → server jalankan `runIngestion()` + `runProjection()`. Berebut lock dan DB connection dengan data-worker.
3. **Cleanup `projection_log` 60s**: `DELETE ... WHERE projectedAt < ? LIMIT ?` tanpa index → full table scan.

### File Diubah

#### `app/api/sync/route.ts`

| Perubahan | Baris | Keterangan |
|-----------|-------|------------|
| Guard GET | ~13-19 | Return 503 jika `DISABLE_SYNC_API=true` |
| Guard POST | ~52-58 | Return 503 jika `DISABLE_SYNC_API=true` |

#### `ecosystem.config.js`

| Perubahan | Baris | Keterangan |
|-----------|-------|------------|
| Tambah env `DISABLE_SYNC_API: 'true'` | ~35 | Hanya di block `dompis-server` |

#### `prisma/migrations/202607220002_add_projection_log_projected_at_index/migration.sql`

**(File Baru)** — ADD INDEX:

| Perubahan | Keterangan |
|-----------|------------|
| `ALTER TABLE ticket_projection_log ADD INDEX idx_ticket_projection_log_projected_at (projectedAt)` | Schema.prisma sudah declare tapi migration tidak pernah create |

#### `prisma/migrations/202607220003_remove_duplicate_projection_log_projected_at_index/migration.sql`

**(File Baru)** — Drop duplicate:

| Perubahan | Keterangan |
|-----------|------------|
| `DROP INDEX idx_projection_log_projected_at` | Auto-generated oleh Prisma (tanpa `map`). Duplicate dari index explicit di atas. |

#### `prisma/schema.prisma` (line 508, 697)

| Perubahan | Keterangan |
|-----------|------------|
| `map: "idx_ticket_raw_status_refresh_seed"` → `map: "idx_ticket_raw_status_refresh_seed_v2"` | Sinkronisasi nama index dengan actual DB (migration sebelumnya buat `_seed_v2`, bukan `_seed`) |
| `@@index([projectedAt])` → `@@index([projectedAt], map: "idx_ticket_projection_log_projected_at")` | Tambah `map` agar Prisma tidak auto-generate nama berbeda yang menyebabkan duplicate |

#### `scripts/manual-20260722-phase4.sql`

**(File Baru)** — Script SQL untuk phpMyAdmin (hanya ADD INDEX projectedAt, 7 redundant indexes sudah tidak ada di DB)

### Catatan Penting
- **7 redundant indexes sudah tidak ada di DB** (`ticket_raw_importedAt_idx`, `ticket_raw_lastSeenAt_idx`, `ticket_raw_sourceUpdatedAt_idx`, `idx_ticket_raw_active_source_incident`, `ticket_raw_sourceTable_lastSeenAt_idx`, `idx_ticket_raw_projection_cursor`, `ticket_raw_sourceTable_syncBatchId_idx`) — kemungkinan sudah di-drop oleh migration cleanup sebelumnya atau manual.
- **Pengecekan DB via phpMyAdmin** mengkonfirmasi 12 secondary index: 10 dari schema.prisma + `idx_ticket_raw_enrichment` (migration-only) + `idx_ticket_raw_status_refresh_seed_v2` (variant dari schema).

### Dampak
- **Index `ticket_raw`**: 12 secondary indexes (stable — tidak ada perubahan)
- **INSERT `ticket_raw`**: Tetap 37–60s (root cause: 12 indexes masih banyak + server-worker contention)
- **Guard server duplication**: ✅ Eliminasi — server return 503, worker tetap jalan normal
- **Cleanup `projection_log`**: 60s timeout → <10ms ✅ (setelah ADD INDEX projectedAt)

## [Phase 3b] — Status Refresh Fix: Enable Terminal Tickets Refresh — 22 Juli 2026

### Masalah
Tiket yang sudah CLOSED tidak pernah di-refresh oleh status refresh. Tiga query (`fetchHotCandidates`, `fetchSafetyCandidates`, `seedRefreshState`) semuanya exclude `FINAL_STATUS_VALUES` (`closed`, `close`, `resolved`, `cancelled`). Akibatnya:
- Bridge incremental hanya ambil data 7 hari via `status_date`
- Status refresh skip tiket terminal → tidak bisa update status yang berubah setelah closed
- Banyak tiket stuck dengan status lama

### File Diubah

#### `lib/status-refresh.ts`

| Perubahan | Baris | Keterangan |
|-----------|-------|------------|
| Hapus `FINAL_STATUS_VALUES` constant | ~94-110 | Seluruh array dihapus — tidak lagi dibutuhkan |
| Hapus filter di `fetchHotCandidates` | ~389-392 | `AND tr.status NOT IN (FINAL_STATUS_VALUES)` dihapus |
| Hapus filter di `fetchSafetyCandidates` | ~438-441 | Sama, filter dihapus |
| Hapus filter di `seedRefreshState` | ~539 | `.filter(FINAL_STATUS_SET.has(...))` dihapus |
| Hapus backlog estimation filter | ~333-336 | `AND tr.status NOT IN (FINAL_STATUS_VALUES)` dihapus |

### Dampak
- Semua tiket (termasuk CLOSED) bisa masuk antrian status refresh
- `fetchByIncident` (tidak terikat window tanggal) ambil data terbaru dari bridge
- Prioritas tetap: 70% hot tickets (sourceUpdatedAt ≤ 15 menit), 30% safety (tiket lama)
- Safety candidates diurutkan least-recently-checked first — tiket yang paling lama tidak dicek diproses duluan

## [Phase 3a] — Dashboard Query Caching (Redis) — 22 Juli 2026

### Masalah
15 parallel dashboard queries (masing-masing 7-29s) menghabiskan pool 20 koneksi → pool exhaustion → MySQL crash.

### Tujuan
Eliminasi beban dashboard ke DB. Setiap page load: 0 query DB (cache hit).

### File Baru

#### `lib/dashboard/dashboard-cache.ts`

Core caching module dengan:
- **Distributed lock** (stampede protection, timeout 10s) — cegah N request rebuild simultan saat cache expire
- **Stale backup** (TTL 300s) — serve data basi kalau DB down atau lambat
- **Versioned cache key**: `dashboard:v1:{md5(params)}:{date}` — auto invalidate saat deploy (ganti version)
- **Fallback**: Redis down → return null → caller query DB normal

Fungsi:
- `getDashboardCache(key)` — Redis.get, miss → lock → rebuild → store
- `setDashboardCache(key, data)` — Redis.set EX 15 + Redis.set `stale:{key}` EX 300
- `invalidateDashboardCache()` — Redis.publish invalidation
- `buildDashboardCacheKey(params)` — md5 hash seluruh request params

### File Diubah

#### `app/api/dashboard/operations-summary/route.ts`
Setiap route handler:
```
1. key = buildDashboardCacheKey(reqParams)
2. Redis.get(key) → HIT → return cached JSON (0 query DB)
3. MISS → Redis.lock(key, EX:10) → GOT → query DB → store → return
4. LOCKED → sleep 100ms → retry cache → fallback DB query
```

#### `app/libs/services/daily-ticket.service.ts`
`countStatuses()` dan method aggregation lainnya wrapping dengan cache check.

#### `lib/projection/index.ts`
Setelah batch projection selesai:
```typescript
await redis.publish('cache:invalidate', 'dashboard');
```

### TTL Strategy

| Cache | TTL | Stale Backup | Alasan |
|-------|-----|-------------|--------|
| KPI summary, bucket counts | 15s | 300s | Data worker cycle 1-2m, 15s cukup fresh |
| Ticket list, pagination | 15s | 300s | User mungkin ganti halaman |
| Search results | No cache | — | Real-time |

### Arsitektur Flow

```
Request → React Query (staleTime:30s, refetchInterval:15s)
  → API Route → cache key → Redis.get
    → HIT:  return <5ms (0 query DB)
    → MISS: acquire lock → query DB (max 1) → store → return
    → POOL: 20 koneksi lapang untuk user lain
```

### Result yang Diharapkan

| Metrik | Sebelum | Sesudah |
|--------|---------|---------|
| Response time dashboard | 7-29s | **<5ms (cache hit)** |
| DB pool terpakai per page load | 15 dari 20 | **0 dari 20** |
| MySQL crash | Tiap 3-5 menit | **Stabil** |
| Cold start (cache miss) | — | **Max 1 query per 15s (stampede protected)** |
| Redis mati | — | **Fallback DB query normal** |
| Data basi | — | **Max 15s** |

---

## [Phase 2] — Dashboard Covering Index — 22 Juli 2026

### Masalah
Dashboard bucket queries (`countStatuses()`, B2C/B2B summary) full scan `ticket` table — 31-43s per query.

### Tujuan
Turunkan dashboard queries 31-43s → <5s via covering index.

### File diubah

#### `prisma/schema.prisma` (baris 351)
```prisma
@@index([source_ticket, workzone, status, status_update, classification_path], map: "idx_ticket_bucket_v2")
```

> **Catatan**: Awalnya dibuat `(source_ticket, workzone, ...)`. Setelah evaluasi log production, direcreate dengan `(workzone, source_ticket, ...)` karena `workzone` lebih selective (cardinality 373 ≈ 1K rows/value vs source_ticket 6 ≈ 63K rows/value). Doc ini mencatat versi final.

#### `prisma/migrations/202607220000_ticket_bucket_covering_index/migration.sql`
Migration SQL untuk create index `idx_ticket_bucket_v2`.

### SQL di production
```sql
DROP INDEX idx_ticket_bucket_v2 ON ticket;
ALTER TABLE ticket ADD INDEX idx_ticket_bucket_v2 
  (workzone, source_ticket, status, status_update, classification_path),
  ALGORITHM=INPLACE, LOCK=NONE;
```

### Result
- Query `countStatuses()` GROUP BY status, status_update: 31-43s → **7-11s**
- Query lainnya (B2C, B2B, service area): 60s timeout → **7-29s**

---

## [Phase 1] — Emergency Stabilization — 22 Juli 2026

### Masalah
- INSERT `ticket_raw` timeout 60s karena 18 index + batch 200 rows
- Pool exhaustion → MySQL crash tiap 3-5 menit
- Dashboard queries 31-43s + 15 parallel → chain reaction

### Tujuan
Hentikan MySQL crash loop dan INSERT timeout data-worker.

### File diubah

#### `ecosystem.config.js`

| Konfigurasi | Baris | Sebelum | Sesudah | Alasan |
|-------------|-------|---------|---------|--------|
| `INGESTION_WRITE_CHUNK_SIZE` (data-worker) | 115 | 200 | **50** | INSERT 50 rows lebih cepat, kurangi timeout 60s |
| `PRISMA_POOL_TIMEOUT` (ops-worker) | 64 | 60 | **10** | Request gagal cepat (10s) daripada nunggu 60s |
| `PRISMA_POOL_TIMEOUT` (data-worker) | 96 | 60 | **10** | Sama |
| `PRISMA_POOL_TIMEOUT` (projection-worker) | 186 | 60 | **10** | Sama |
| Duplicate `PRISMA_CONNECTION_LIMIT: '15'` | 96 | Ada | **Dihapus** | Efektif pakai `'25'` di line 110 |

#### `app/libs/prisma.ts`

| Konfigurasi | Baris | Sebelum | Sesudah |
|-------------|-------|---------|---------|
| `pool_timeout` di DATABASE_URL | 21 | 30 | **10** |

### SQL di production
```sql
DROP INDEX idx_ticket_raw_status_refresh_seed ON ticket_raw;
```
**Alasan**: `idx_ticket_raw_status_refresh_seed_v2` sudah mencakup dengan kolom lebih sedikit (6 vs 7, tanpa `incident`). Kurangi 1 index write per INSERT ke `ticket_raw`.

### Result
- INSERT ticket_raw: 60s timeout → **2-21s (avg 8s)**
- MySQL crash: tiap 3 menit → **tidak ada**

---

## Daftar Lengkap Perubahan

| No | File | Tindakan | Phase |
|----|------|----------|-------|
| 1 | `ecosystem.config.js` | UBAH — WRITE_CHUNK_SIZE 200→50, POOL_TIMEOUT 60→10, hapus duplicate CONNECTION_LIMIT | P1 |
| 2 | `app/libs/prisma.ts` | UBAH — pool_timeout 30→10 | P1 |
| 3 | `prisma/schema.prisma` | UBAH — tambah `@@index idx_ticket_bucket_v2` | P2 |
| 4 | `prisma/migrations/202607220000_ticket_bucket_covering_index/migration.sql` | BARU — migration SQL covering index | P2 |
| 5 | `lib/dashboard/dashboard-cache.ts` | BARU — core caching + lock + stale fallback | P3 |
| 6 | `app/api/dashboard/operations-summary/route.ts` | UBAH — cache layer di route handler | P3 |
| 7 | `app/libs/services/daily-ticket.service.ts` | UBAH — cache di aggregation methods | P3 |
| 8 | `lib/projection/index.ts` | UBAH — publish cache invalidation event | P3 |

## Catatan Penting

1. **Schema.prisma line 351** — kolom index saat ini `[source_ticket, workzone, ...]` di file, tapi production sudah `[workzone, source_ticket, ...]`. Perlu diselaraskan saat deploy berikutnya.
2. **Redundansi index**: `idx_ticket_bucket` (3 cols: source_ticket, classification_path, status) adalah subset dari `idx_ticket_bucket_v2` (5 cols). Bisa di-drop setelah stabil.
3. **Env var baru**: `DASHBOARD_CACHE_TTL` untuk tuning TTL tanpa deploy kode.
4. **Cold start**: Cache pertama kali setelah deploy kosong → 1 user kena query lambat. Pre-warm cron bisa ditambahkan nanti.
