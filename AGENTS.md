# QOSMIC Bridge Integration — Ringkasan Final

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    QOSMIC Bridge API                         │
│    https://qosmic.solusee.id/api/metabase-bridge            │
│    Rate limit: 20 req/menit (shared semua konsumen)         │
│    Endpoints: /nossa (open), /nossa-closed (closed)         │
└──────────┬──────────────────────────────────────┬───────────┘
           │                                      │
      ┌────▼────┐                           ┌─────▼────┐
      │  Redis  │                           │  Queue   │
      │  Rate   │                           │ (local,  │
      │  Limiter│                           │  3 conc) │
      └─────────┘                           └─────┬────┘
           │                               ┌──────┼──────┐
           │                               │      │      │
      ┌────▼───────────────────────────────▼──┐ ┌─▼──┐ ┌─▼──┐
      │         lib/external-db/              │ │    │ │    │
      │         qosmic-bridge/                │ │API │ │Bg  │
      │  client.ts — HTTP client + retry      │ │Srch│ │Sync │
      │  types.ts  — QosmicRawRow, response   │ │FaseE│ │     │
      │  nossa.ts  — fetchByIncident, iterators│ │    │ │     │
      │  queue.ts  — bounded concurrency+prio │ │    │ │     │
      │  window-planner.ts — DateWindow logic │ │    │ │     │
      │  status-refresh-adapter.ts — adapter   │ │    │ │     │
      └───────────────────────────────────────┘ └────┘ └────┘
```

## Layer-Layer

### 1. Bridge Client (`lib/external-db/qosmic-bridge/`)
- **client.ts**: HTTP GET + Bearer token + Redis rate limiter + retry (4x, exponential backoff) + timeout (15s)
- **queue.ts**: Bounded concurrency (3) + priority (`interactive` > `background`)
- **types.ts**: `QosmicRawRow = Record<string, unknown>`, `QosmicQueryResponse<T>`
- **nossa.ts**: `fetchByIncident(resource, incident)`, `fetchByIncidentAnyStatus(incident)`, paginated iterators (`iterateNossaOpen`, `iterateNossaClosedIncremental`, `iterateNossaClosedBackfill`)
- **window-planner.ts**: `DateWindow`, `splitIntoInitialWindows`, `bisectWindow`, overflow detection (5000 rows/window)

### 2. Normalizer (`lib/ingestion/normalizer.ts`)
Maps external column names → internal snake_case. 6 bridge-specific mappings:
- `Last_Work_Log_Date` → `worklog_summary`
- `last_updated_work_log` / `Last_Updated_Work_Log` → `last_update_worklog`
- `Closed/Reopen_By` → `closed_reopen_by`
- `C_REALM` → `realm`
- `C_TSC_RESULT` → `tsc_result`
- `C_SCC_RESULT` → `scc_result`

### 3. Ingestion Pipeline (`lib/ingestion/index.ts`)
- `processRawRows` (exported): normalize → validate → identity resolution → conflict resolution → bulk upsert → quarantine → checkpoint
- `processTable`: bridge detection + branching (bridge path vs MySQL path)
- Bridge path: generator loop (`iterateNossaOpen` / `iterateNossaClosedIncremental` / `iterateNossaClosedBackfill`) → `processRawRows` per page
- Bridge tables don't use MySQL cursor; checkpoint = `{ lastCursorId: null, lastModifiedAt: nowWib() }`

### 4. Status Refresh (`lib/status-refresh.ts`)
- Conditional call di line 999: `isQosmicBridgeConfigured()` → `fetchExternalRowsViaBridge()` else `fetchExternalRows()` (MySQL)
- `fetchExternalRowsViaBridge()`: iterates incidents one-by-one via `fetchByIncident` + `enqueueBridgeCall` (background priority) + normalizes

### 5. API Search (`app/api/nossa/search/route.ts`)
- `GET /api/nossa/search?incident=INC51123643`
- Auth: admin, teknisi, helpdesk, superadmin
- Rate limit: 30 req/60s
- Query `ticket_raw` lokal via Prisma (tidak konsumsi rate limit bridge)
- Menentukan `resource` dari `row.sourceTable`

### 6. Backfill Script (`scripts/qosmic-bridge-backfill.ts`)
- `npm run bridge:backfill -- --from 2026-01-01 --to 2026-07-14`
- Iterate `iterateNossaClosedBackfill` → `processRawRows` per page
- Graceful shutdown via SIGINT/SIGTERM, progress log per window

## Alur Data

### Ingestion (periodik, tiap 2 menit)
```
scheduleEveryMinutes(INGESTION_INTERVAL_MINUTES)
  → runIngestion()
    → runIngestionMode('incremental')
      → processTable('nossa', 'incremental')
        → iterateNossaOpen() → processRawRows → ticket_raw upsert
      → processTable('nossa_closed', 'incremental')
        → iterateNossaClosedIncremental(1) → processRawRows → ticket_raw upsert
  → requestImmediateProjection()
```

### Status Refresh (periodik, tiap 1 menit)
```
scheduleEveryMinutes(STATUS_REFRESH_INTERVAL_MINUTES)
  → pilih candidate stale tickets dari ticket_raw
  → fetchExternalRowsViaBridge(sourceTable, incidents)
    → enqueueBridgeCall(fetchByIncident, 'background') per incident
    → normalizeExternalRow
  → updateChangedRows() jika ada perubahan
  → trigger projection
```

### Search (real-time, via API)
```
GET /api/nossa/search?incident=INC51123643
  → prisma.ticket_raw.findFirst({ where: { incident } })
  → resource = row.sourceTable === 'nossa' ? 'nossa' : 'nossa_closed'
  → return { success, data, resource, found }
```

### Backfill (one-shot, via script)
```
npm run bridge:backfill -- --from 2026-01-01 --to 2026-07-14
  → iterateNossaClosedBackfill(from, to)
    → splitIntoInitialWindows(7 days)
    → per window: iterateNossaClosedWindow → buffer → yield rows
    → processRawRows → ticket_raw upsert
```

## Pemicu Data dari Nossa

| Pemicu | Worker/Script | Interval | Data |
|--------|--------------|----------|------|
| Periodik | `dompis-data-worker` | Tiap 1 menit (saat lock didapat) | `nossa`: full scan; `nossa_closed`: 7 hari terakhir |
| Startup | `dompis-data-worker` | Sekali saat start (`RUN_ON_START=true`) | Sama seperti periodik |
| Status refresh | `dompis-data-worker` | Tiap 1 menit (fase setelah ingestion) | Per-ticket lookup untuk ticket yang stale |
| Active refresh | `dompis-data-worker` | Tiap 1 menit (fase setelah status refresh) | Per-ticket lookup untuk ticket aktif |
| User search | API `GET /api/nossa/search` | On-demand via UI | Single incident lookup |
| Backfill | `npm run bridge:backfill` | One-shot manual | `nossa_closed` historical range |
| Force resync | `npm run ingestion:force-resync` | One-shot manual | Full backfill + incremental |

## Konfigurasi Lingkungan

`.env` / `ecosystem.config.js`:
- `QOSMIC_BRIDGE_ENABLED=true` — master switch
- `QOSMIC_BRIDGE_BASE_URL` — endpoint bridge
- `QOSMIC_BRIDGE_TOKEN` — bearer token
- `QOSMIC_BRIDGE_RATE_LIMIT_PER_MIN=20` — global rate limit
- `QOSMIC_BRIDGE_TIMEOUT_MS=15000` — request timeout
- `QOSMIC_BRIDGE_RETRY_MAX=4` — max retries
- `QOSMIC_BRIDGE_MAX_CONCURRENT=3` — local concurrency
- `QOSMIC_BRIDGE_BACKFILL_RATE_LIMIT_PER_MIN=6` — budget backfill (sisa 14 untuk ingestion+refresh)
- `DATA_WORKER_BACKFILL_ENABLED=true` — aktifkan backfill startup di data-worker

Jika `QOSMIC_BRIDGE_ENABLED=false` atau tidak dikonfigurasi, fallback penuh ke MySQL langsung.

## Catatan Penting

- **Rate limit 20 req/menit** shared untuk SEMUA konsumen. Budget: data-worker (ingestion + refresh) 14 req/min, backfill 6 req/min. Search interaktif tidak konsumsi rate limit (query lokal).
- **Queue priority**: `interactive` (UI search) selalu didahulukan dari `background` (sync workers).
- **Bulk vs single**: Bridge tidak punya batch endpoint. Ingestion pakai paginated iterators; status refresh pakai per-ticket lookup.
- **Overflow handling**: Jika window `nossa_closed` > 5000 baris, window di-bisect otomatis.
- **Backward compatibility**: Bridge opsional; tanpa konfigurasi, semua jalan seperti sebelumnya via MySQL.
