# Rencana — Aturan Update `ticket_raw` (Ingestion) + Failover Nossa + Optimasi Worker

Status: **DITAHAN — belum dieksekusi.** Disimpan dari sesi diskusi untuk dieksekusi kemudian.
Sumber: diskusi & analisis dokumentasi Metabase Bridge API 2026-08-08.

## A. Konteks & Masalah

Ditemukan inkonsistensi & inefisiensi:

1. **Aturan update DATA `ticket_raw` berbeda antar jalur:**
   - Jalur Ingestion (bulk) — `bulkUpsertTicketRaw` (`lib/ingestion/index.ts:642-652`): untuk row bridge (`sourceTable IN ('nossa','nossa_closed')`) kolom DATA hanya **diisi saat NULL** — tidak pernah menimpa, walau sumber berubah. (commit `edf3202` tanpa penjelasan).
   - Jalur Single-Ticket (refresh/search/backfill) — `bridge-queue.ts:65-89`: overwrite saat `VALUES(sourceUpdatedAt) IS NOT NULL AND (sourceUpdatedAt IS NULL OR VALUES(sourceUpdatedAt) >= sourceUpdatedAt) AND VALUES(col) IS NOT NULL`, plus `syncVersion++`, `isActive=TRUE`.
   - Dampak: perubahan sumber (summary, worklog, solution, `closed_by`, `resolve_date`, `status_date`) tidak masuk via jalur utama; `sourceHash`/`syncVersion` naik tapi DATA basi → mismatch → `shouldSkipProjection` mere-proyeksi data basi ke `ticket`.

2. **Scan `/nossa` open > offset 5000 tidak tertutup** (log: `processed:6000` + warning cap).

3. **Scan `nossa_closed` 7 hari setiap cycle boros** — menguras budget rate-limit global (14/menit).

4. **Log bermasalah:** DLQ error `[object Object]` & spam `Menunggu slot rate-limit` setiap 5 detik/request.

## B. Model Sumber Kebenaran (disepakati)

- **Nossa / Nossa-closed** = sumber kebenaran utama (self-update).
- **Piloting** = pelengkap — mengisi NULL, **tidak menimpa** data yang diisi Nossa.
- **Jika Nossa DAN Nossa-closed mati** → source of truth pindah ke **Piloting** (boleh menimpa).

### Matriks aturan update

| Penulis | Row lama | NossaDown | Hasil |
|--------:|:--------:|:--------:|-------|
| Nossa | Nossa | - | timpa (self-update) |
| Nossa | Piloting | - | timpa (Nossa = kebenaran) |
| Piloting | Nossa | off | isi-NULL saja (pelengkap) |
| Piloting | Piloting | - | timpa (piloting update sendiri) |
| Nossa-closed | Nossa | - | timpa |
| Nossa-closed | Piloting | - | timpa |
| Piloting | Nossa | on | timpa (failover, truth pindah) |
| import_tiket | Nossa | - | isi-NULL saja (= perilaku saat ini) |
| import_tiket | import_tiket | - | timpa (= perilaku saat ini) |

### Logika inti (SQL)

```
pemilikLama = sourceTable                                    // kolom row lama
penulis     = VALUES(sourceTable)                            // incoming
nossaDown   = flag failover (bridge mati >= TTL)             // dihitung per batch

pelengkapOn = pemilikLama ∈ {nossa, nossa_closed}
              AND penulis ∉ {nossa, nossa_closed}
              AND NOT nossaDown

col = IF(pelengkapOn,
         IF(col IS NULL AND VALUES(col) NOT NULL, VALUES(col), col),  // pelengkap
         IF(VALUES(col) NOT NULL, VALUES(col), col))                   // timpa/self
```

Catatan: `piloting_tickets` hanya di-ingest row `status_validasi='OPEN'` + tangkapan CLOSE (`index.ts:1184-1185,1301`).

## C. Implementasi — Failover & Heartbeat

1. **Heartbeat di** `lib/external-db/qosmic-bridge/client.ts`:
   - Setelah `res.ok` sukses di `qosmicBridgeGet` (sekitar `client.ts:304-310`): `SET qosmic-bridge:healthy` TTL **15 menit** (env `QOSMIC_BRIDGE_HEALTH_TTL_MS`, default `900000`). Fire-and-forget (tidak memblokir request).
   - Semua konsumen (ingest/refresh/backfill/search) lewat client yang sama → satu titik penanda.
2. **Helper `isQosmicBridgeDown()`**:
   - Redis tidak siap → `false` (**fail-closed**: jangan failover kalau tak bisa confirmasi, hindar flapping).
   - Redis siap tapi key expire/tidak ada → `true`.
3. **Penerapan**: `nossaDown` dihitung sekali per `processBatch` → diteruskan ke `bulkUpsertTicketRaw`.
4. **`sourceUpdatedAt` monotonic (GREATEST)** — mirror `bridge-queue.ts:76-80`:
   ```
   sourceUpdatedAt = CASE
     WHEN VALUES(sourceUpdatedAt) IS NULL THEN sourceUpdatedAt
     WHEN sourceUpdatedAt IS NULL THEN VALUES(sourceUpdatedAt)
     ELSE GREATEST(VALUES(sourceUpdatedAt), sourceUpdatedAt)
   END
   ```
   - Risiko kecil: `resolveConflict` (conflict-resolver.ts:79-91) membandingkan `sourceUpdatedAt`; karena kedua API memakai `date_modified` yang sama, jarang bentrok. Dipantau; bila perlu di-scope per-tier kepemilikan.
5. **Observability:** log `warn` saat `nossaDown` berubah `false→true` (failover aktif) & `true→false` (pulih).

## D. Optimasi Worker (berdasarkan dokumentasi API 2026-08-08)

Fakta doc yang dipakai:
- `/nossa` menerima `incident`, `status`, `date_from`, `date_to`, `limit` (≤1000), `offset` (≤5000). Order `Status_Date DESC`.
- `/nossa-closed` (~3,4j baris): tanpa filter incident wajib window, default 7 hari, maks 31 hari. **Floor `date_from` = 2026-01-01**; seluruh rentang sebelum itu → 422.
- Rate: 20 req/menit per API key (shared).

1. **`/nossa` (open) — scan HYBRID:**
   - Cycle rutin (tiap 1-2 menit): ambil top-list terbaru via offset (hemat budget). Ini sudah berjalan.
   - **Deep sweep jarang (harian)**: window `status_date` + bisection (reuse `window-planner.ts`: `splitIntoInitialWindows`/`bisectWindow`) sehingga tiket open > 6000 tidak pernah hilang permanen. Jadwal: cron harian (mis. 02:00 WIB atau N cycle sekali), dikontrol env `BRIDGE_OPEN_DEEP_SWEEP_ENABLED` (+ interval).
   - Targeted lookup `?incident=` saat refresh/search (sudah ada di `fetchByIncident`).
2. **`nossa_closed` incremental 7 → 1-2 hari** (`bridge-queue.ts:206` `iterateNossaClosedIncremental(7)`): env `NOSSA_CLOSED_INCREMENTAL_DAYS` default 2 → memotong volume 3-4×, mengembalikan budget global untuk status refresh.
3. **Floor & 422**: simpan clamp `date_from` ke 2026-01-01 (sudah ada di docs); pastikan iterator/backfill **skip** tanpa retry saat balas 422.
4. **Budget rate-limit: global 18 / backfill 2**:
   - `QOSMIC_BRIDGE_RATE_LIMIT_PER_MIN` tetap `20`.
   - `QOSMIC_BRIDGE_BACKFILL_RATE_LIMIT_PER_MIN: '2'` di `ecosystem.config.js` (dompis-bridge-worker line 197; untuk data-worker opsional set 2 juga agar konsisten global).
   - Dengan `DATA_WORKER_BACKFILL_ENABLED: 'false'` (startup backfill data-worker mati), backfill praktis hanya manual → 2 req/min cukup. Bila startup/weekly backfill diaktifkan lagi nanti, budget ini jadi bottleneck (perlu naikkan kembali atau API key kedua).
   - **Catatan:** env `QOSMIC_BRIDGE_INGESTION_MAX_PER_MIN='14'` di config (line 161) **tidak dibaca kode** — mati; jangan diandalkan.

## E. Logging & Maintainability

1. `worker-bridge.ts:32` — `logger.error('[Bridge] DLQ threshold exceeded', { total, ... })` salah guna signature `logger.error(message, error?, context?)` → output `error: {message: "[object Object]"}`. Rapatkan: `logger.error(msg, undefined, { total, interactive, ingestion, backfill })`.
2. Throttle log `Waiting slot rate-limit` (`client.ts:170`): hanya log bila `wait` > N dtk atau sekali per 5-10 dtk per key, untuk menghindari banjir log.
3. (Opsional) Bersihkan job failed di BullMQ secara berkala.

## F. Verifikasi & Deployment

1. `npm run typecheck` → `npm run build:workers`.
2. `commit bertahap` (gaya repo: fix:/feat:):
   - (1) aturan DATA + failover + heartbeat di `bulkUpsertTicketRaw` & `client.ts`;
   - (2) optimasi window (open hybrid + closed incremental) & budget env;
   - (3) perbaikan logging (DLG, rate-limit throttling).
3. Prod (dijalankan user):
   - `pm2 stop` dompis-data-worker & dompis-bridge-worker;
   - `git pull` (origin/main) → `npm run build:workers`;
   - `pm2 start` / reload;
   - Verifikasi: key `qosmic-bridge:healthy` ada di Redis; log failover normal; budget consumption di log (`waitMs`); hasil scan open deep sweep (jumlah window terproses).

## G. Fase Lanjutan (OPSIONAL, TIDAK dieksekusi sekarang)

- **`/ticket-by-service`**: pencarian berdasarkan `service_no` / ND / no pelanggan — SELECTIVE (ber-indeks), tanpa ikatan window 31-hari & tanpa floor 2026-01-01. Rencana: adapter di `status-refresh-adapter.ts` / `nossa.ts` + API route untuk UI (cari tiket oleh no service). Belum masuk scope implementasi.

## Referensi
- `lib/ingestion/index.ts`: `bulkUpsertTicketRaw` (618-683), `processBatch` (685-879), `FIELDS_TO_MAP`/`TICKET_RAW_BULK_COLUMNS` (85-184), `processTable` (1036, bridge push job 1163-1180).
- `lib/ingestion/conflict-resolver.ts`: `resolveConflict` (58-118), stale guard (79-91).
- `lib/external-db/qosmic-bridge/client.ts`: `qosmicBridgeGet` (225-333), titik kesuksesan (304-310), rate limiter.
- `lib/external-db/qosmic-bridge/bridge-queue.ts`: `buildUpsertSetClause` (41-91), `handleIngestNossa` (195-206), budget `RATE_LIMIT_KEY_BACKFILL`.
- `lib/external-db/qosmic-bridge/nossa.ts`: `iterateNossaOpen` (105-130), `iterateNossaClosedIncremental` (218-229), `iterateNossaBackfill` (238-256).
- `lib/external-db/qosmic-bridge/window-planner.ts`: `DateWindow`, `splitIntoInitialWindows`, `bisectWindow`, overflow (5000).
- `lib/projection/index.ts`: `shouldSkipProjection` (612-638).
- `worker-data.ts`: `runWeeklyBackfill` (59-98), startup delay (426-432).
- `worker-bridge.ts`: `checkDLQ` (28-50).
- `ecosystem.config.js`: env bridge/data worker rate-limit, `DATA_WORKER_BACKFILL_ENABLED` (113), `BRIDGE_JOB_WEEKLY_SAFETY_BACKFILL_ENABLED` (204) — saat ini tidak dibaca kode (belum terpasang).