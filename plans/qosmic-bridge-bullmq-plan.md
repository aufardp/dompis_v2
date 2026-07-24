# BullMQ Bridge Integration Plan — Final

## Latar Belakang

- Volume ticket sangat tinggi (97k+ piloting_tickets + bridge tables)
- Ribuan pemakai
- Rate limit QOSMIC Bridge: **20 req/min shared** — satu token bucket untuk semua konsumen
- Masalah saat ini: satu process (`dompis-data-worker`) handling ingestion + refresh + bridge, menyebabkan blockade dan timeout
- BullMQ memberikan: job persistence (survive crash), retry otomatis, priority queue, DLQ, stall detection — semua tidak ada di in-memory queue saat ini

## Arsitektur Final

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Redis (existing)                                 │
│  Perubahan infra: noeviction | appendonly yes | maxmemory 256mb           │
│                                                                           │
│  ┌─────────────┐  ┌────────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ BullMQ      │  │ Rate       │  │Distributed│  │ Cache / SSE / Lock  │ │
│  │ Queues      │  │ Limiter    │  │ Lock      │  │ (unchanged)         │ │
│  └──────┬──────┘  └────────────┘  └──────────┘  └─────────────────────┘ │
└─────────┼────────────────────────────────────────────────────────────────┘
          │
    ┌─────┼─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │ bridge:interactive     │  │ bridge:ingestion  │  │ bridge:backfill   │
    │ Worker A (FAST)       │  │ Worker B (SLOW)   │  │ Worker C (SLOW)   │
    │ Concurrency: 2        │  │ Concurrency: 1    │  │ Concurrency: 1    │
    │                       │  │                   │  │                   │
    │ search:incident (P1)  │  │ ingest:nossa      │  │ backfill:window   │
    │ refresh:ticket (P5)   │  │ ingest:nossa_closed│  │                   │
    │                       │  │                   │  │                   │
    │ Selesai <5s per job   │  │ 5-10 menit per job│  │ per window        │
    └──────────┬────────────┘  └─────────┬─────────┘  └────────┬─────────┘
               │                        │                      │
               └────────────┬───────────┴──────────┬───────────┘
                            │                      │
                    ┌───────▼──────────────────────▼───────┐
                    │         Handler Layer                 │
                    │  case 'ingest:nossa':                  │
                    │    iterateNossaOpen()                  │
                    │    → per page: client.ts (rate limited)│
                    │    → normalize → processRawRows        │
                    │    → per-incident Redis lock           │
                    │    → upsert (with staleness guard)     │
                    │                                        │
                    │  case 'refresh:ticket':                │
                    │    fetchByIncident() (rate limited)    │
                    │    → normalize → per-incident lock     │
                    │    → upsert (with staleness guard)     │
                    │                                        │
                    │  case 'search:incident':               │
                    │    fetchByIncident() (rate limited)    │
                    │    → normalize → per-incident lock     │
                    │    → upsert (with staleness guard)     │
                    │    → return result via waitUntilFinished│
                    │                                        │
                    │  case 'backfill:window':               │
                    │    iterateNossaClosedWindow(from, to)  │
                    │    → per page: client.ts (backfill budget)
                    │    → processRawRows → upsert           │
                    └──────────────────┬─────────────────────┘
                                       │
                    ┌──────────────────▼─────────────────────┐
                    │  client.ts (existing, UNCHANGED)        │
                    │  checkRateLimit(Redis sorted set)       │
                    │  — satu-satunya gatekeeper HTTP call    │
                    └──────────────────┬─────────────────────┘
                                       │
                            ┌──────────┴──────────┐
                            ▼                     ▼
                      QOSMIC API          Prisma (DB write)
                      20 req/min           ticket_raw upsert
```

## 3 Queue + 3 Worker Dedicated

| Queue | Worker | Concurrency | Jobs | Priority |
|-------|--------|-------------|------|----------|
| `bridge:interactive` | Worker A (FAST) | 2 | `search:incident`, `refresh:ticket` | P1 search > P5 refresh |
| `bridge:ingestion` | Worker B (SLOW) | 1 | `ingest:nossa`, `ingest:nossa_closed` | - |
| `bridge:backfill` | Worker C (SLOW) | 1 | `backfill:window` | - |

### Kenapa 3 queue, bukan 1 queue dengan 2 Worker?

BullMQ Worker tidak punya routing "Worker ini cuma boleh ambil job bernama X". Dua Worker yang polling queue yang sama akan race condition — Worker A (FAST) bisa kebagian job `ingest:nossa` yang lama, menyandera slot search. Pemisahan 3 queue + 3 Worker dedicated adalah satu-satunya cara menjamin isolasi concurrency.

### Prioritas

Hanya relevan di `bridge:interactive` — `search:incident` (P1) harus didahulukan dari `refresh:ticket` (P5) karena user-facing. `bridge:ingestion` dan `bridge:backfill` tidak perlu prioritas (cuma 1 job type per queue).

## Rate Limiter — Hanya Redis di Lapisan HTTP

| Lapisan | Mekanisme | Peran |
|---------|-----------|-------|
| BullMQ | Tanpa limiter | Queue, persistence, priority, retry, DLQ |
| `client.ts` | `checkRateLimit` (Redis sorted set) | **Gatekeeper** — dipanggil sebelum setiap `fetch()` ke QOSMIC |

### Kenapa BullMQ tidak pakai limiter?

BullMQ limiter menghitung **job**, bukan HTTP request. Satu job `ingest:nossa` bisa melakukan 5-6 HTTP calls (pagination) tapi BullMQ anggap 1. Redis rate limiter di `client.ts` adalah satu-satunya yang benar-benar membatasi 20 req/min ke QOSMIC. Tidak ada ilusi keamanan ganda.

### Budget

| Operasi | Budget | Redis Key |
|---------|--------|-----------|
| Ingestion + refresh + interactive | 14 req/min shared | `qosmic-bridge:global` (existing) |
| Backfill | 6 req/min | `qosmic-bridge:backfill` (existing) |
| **Total** | **20 req/min** | |

## Write Coordination — Per-Incident Redis Lock + Staleness Guard

### Problem

Setelah BullMQ, penulisan terjadi di handler secara async (fire-and-forget). Tidak ada global lock `ticket_raw_writer` lagi yang menyerialkan. Ingest dan refresh bisa menulis incident yang sama secara bersamaan.

### Layer 1: Per-Incident Redis Lock

Mencegah dua penulisan **bersamaan** ke incident yang sama:

```typescript
const lockKey = `ticket_raw:lock:${incident}`;
const acquired = await redis.set(lockKey, ownerId, 'PX', 5000, 'NX');
if (!acquired) return { skipped: true }; // worker lain sedang nulis
try {
  await prisma.$executeRaw`... upsert ...`;
} finally {
  await redis.del(lockKey);
}
```

| Karakteristik | Global lock (lama) | Per-incident lock (baru) |
|---|---|---|
| Scope | Semua write ke `ticket_raw` | Per `incident` |
| Durasi | Seluruh siklus refresh (menit) | Satu upsert (ms) |
| Redis call per write | 0 (via Prisma) | 2 (SET NX + DEL) |
| Granularitas | Blokir semua table | Hanya incident yg sama |
| Crash safe | TTL cleanup (120s) | TTL 5s auto-release |

### Layer 2: Staleness Guard (SQL `CASE WHEN`)

Mencegah data basi menimpa data baru secara **berurutan** (setelah lock lepas):

```typescript
const DATA_COLUMNS = [
  'sourceTable', 'status', 'status_date', 'date_modified',
  'worklog_summary', 'last_update_worklog',
  'closed_reopen_by', 'realm', 'tsc_result', 'scc_result',
  // ... semua kolom data kecuali sourceUpdatedAt, syncVersion
];

function buildUpsertSetClause() {
  const guards = DATA_COLUMNS.map(col => `
    ${col} = IF(
      VALUES(sourceUpdatedAt) IS NOT NULL
      AND (sourceUpdatedAt IS NULL OR VALUES(sourceUpdatedAt) >= sourceUpdatedAt),
      VALUES(${col}), ${col}
    )`
  );

  return `
    sourceUpdatedAt = CASE
      WHEN VALUES(sourceUpdatedAt) IS NULL THEN sourceUpdatedAt
      WHEN sourceUpdatedAt IS NULL THEN VALUES(sourceUpdatedAt)
      ELSE GREATEST(VALUES(sourceUpdatedAt), sourceUpdatedAt)
    END,
    syncVersion = IF(
      VALUES(sourceUpdatedAt) IS NOT NULL
      AND (sourceUpdatedAt IS NULL OR VALUES(sourceUpdatedAt) >= sourceUpdatedAt),
      syncVersion + 1, syncVersion
    ),
    ${guards.join(',\n')}
  `;
}
```

Hanya nama kolom yang di-generate — nilai tetap via Prisma parameter binding (`Prisma.sql` tagged template), aman dari SQL injection.

### Truth Table

| Incoming `sourceUpdatedAt` | Existing `sourceUpdatedAt` | Kolom data | `syncVersion` | `sourceUpdatedAt` hasil |
|---|---|---|---|---|
| INSERT (NULL) | — | VALUES | 1 | NULL (jujur) |
| INSERT (valid) | — | VALUES | 1 | VALUES |
| NULL | valid 10:02 | existing ✅ | **no inc** ✅ | **existing** 10:02 ✅ |
| valid 10:04 | valid 10:02 | VALUES (baru) ✅ | inc ✅ | GREATEST = 10:04 ✅ |
| valid 10:00 | valid 10:02 | **existing** ✅ | **no inc** ✅ | existing 10:02 ✅ |
| valid 10:02 | NULL | VALUES ✅ | inc ✅ | VALUES 10:02 ✅ |

Semua skenario ditutup dalam satu statement — tanpa SELECT terpisah, tanpa sentinel `new Date(0)`.

## Job Persistence

### Retry (BullMQ default)

| Attempt | Delay (exponential) | Total wait |
|---------|---------------------|------------|
| 1 (first) | 0 | instant |
| 2 (retry 1) | ~2s | 2s |
| 3 (retry 2) | ~8s | 10s |
| → DLQ | — | job pindah ke `bridge:*:failed` |

### Stalled Job Detection

BullMQ mendeteksi job yang tidak memberi sinyal `completed` dalam 30 detik. Untuk job panjang (`ingest:nossa`), perpanjang `stalledInterval`:

```typescript
const worker = new Worker(queue, handler, {
  stalledInterval: 120000, // cek stall tiap 2 menit
  maxStalledCount: 2,
});
```

Atau kirim progress heartbeat manual:
```typescript
for await (const rows of iterateNossaOpen()) {
  await job.updateProgress({ processed: result.processed });
  await processRawRows(rows, ...);
}
```

### DLQ (Dead Letter Queue)

Job gagal 3× otomatis pindah ke `bridge:interactive:failed`, `bridge:ingestion:failed`, `bridge:backfill:failed`. Isi: stacktrace, `attemptsMade`, `data`.

## Job Dedup (jobId Eksplisit)

| Job Type | `jobId` | Efek |
|----------|---------|------|
| `ingest:nossa` / `ingest:nossa_closed` | `` `ingest:${tableName}` `` | Hanya 1 job per tabel. Job baru ditolak selama yang lama masih antri/active |
| `refresh:ticket` | `'refresh:${sourceTable}:${incident}'` | Cegah duplikat antar siklus refresh untuk incident yang sama |
| `backfill:window` (manual one-off) | `'backfill:${from}:${to}'` | Cegah re-run script push window yang sama dua kali |
| `backfill:window` (weekly safety) | `` `backfill:weekly:${weekMarker}:${from}:${to}` `` | Unik per eksekusi mingguan — window tumpang tindih tetap di-eksekusi ulang |
| `search:incident` | (otomatis UUID) | Tidak perlu dedup — search adalah operasi idempoten, tidak ada risiko duplikat berbahaya |

BullMQ otomatis tolak `add()` jika `jobId` yang sama masih dalam status waiting / active / delayed.

## Circuit Breaker

Reuse pola `shouldRunWithCircuitBreaker` dari `lib/workers/task-runner.ts`:

```typescript
const circuitState = {
  consecutiveErrors: 0,
  circuitOpenedAt: null as Date | null,
  lastError: null as Error | null,
};

// Sebelum consume job — di failed handler
worker.on('failed', (job, err) => {
  if (isTransientError(err)) {
    circuitState.consecutiveErrors++;
    circuitState.lastError = err;
  }
});
worker.on('completed', () => {
  circuitState.consecutiveErrors = 0;
  circuitState.circuitOpenedAt = null;
});

// Di main loop: if (!shouldRunWithCircuitBreaker(circuitState, 5, 10*60*1000)) skip
```

Konfigurasi: 5 consecutive errors → circuit open, 10 menit → half-open.

## Correlation ID

```typescript
// Producer:
const correlationId = randomUUID();
await queue.add('ingest:nossa', { ..., correlationId });

// Consumer handler:
async function handle(job) {
  runWithCorrelationContext(job.data.correlationId, async () => {
    // Semua log di sini punya correlationId nyambung ke producer
  });
}
```

## Per-Operasi Flow

### search:incident (Worker A, P1, blocking 5s)

```
API /api/nossa/search?incident=INC123
  → BRIDGE_JOB_SEARCH_ENABLED === 'true'?
     false → return "tidak tersedia"
  → query lokal (prisma.ticket_raw.findFirst)
     ketemu? → return data
     tidak? → interactiveQueue.add('search:incident', { incident }, { priority: 1 })
            → job.waitUntilFinished(queueEvents, 5000)
               → selesai? → return data dari DB
               → timeout? → return "sedang diproses, coba lagi nanti"
```

### refresh:ticket (Worker A, P5, fire-and-forget)

```
Data-worker runStatusRefresh():
  → BRIDGE_JOB_REFRESH_ENABLED === 'true'?
     false → log "disabled", return
  → pilih candidate stale tickets (query yg sudah ada)
  → interactiveQueue.addBulk(
      incidents.map(i => ({
        name: 'refresh:ticket',
        data: { incident: i.incident, sourceTable: i.sourceTable },
        opts: { priority: 5, jobId: `refresh:${i.sourceTable}:${i.incident}` },
      }))
    )

Worker A handler:
  → fetchByIncident(sourceTable, incident) — via client.ts (Redis rate limited)
  → normalizeExternalRow
  → per-incident Redis lock
  → upsert ticket_raw (dengan staleness guard)
```

### ingest:nossa / ingest:nossa_closed (Worker B, fire-and-forget)

```
Data-worker processTable():
  → BRIDGE_JOB_INGESTION_ENABLED === 'true'?
     false → log "disabled", return
  → ingestionQueue.add(
      tableName === 'nossa' ? 'ingest:nossa' : 'ingest:nossa_closed',
      { table: tableName },
      { jobId: `ingest:${tableName}` },  // ingest:nossa ATAU ingest:nossa_closed
    )
  → activeCursor = { lastCursorId: null, lastModifiedAt: nowWib() }

Worker B handler:
  → iterateNossaOpen() / iterateNossaClosedIncremental(7)
    → for await (rows):
        → client.ts fetch per page (Redis rate limited)
        → processRawRows → normalize → validate
        → per-incident lock → upsert (staleness guard)
  → selesai
```

### backfill:window (Worker C, fire-and-forget)

```
Script npm run bridge:backfill:
  → BRIDGE_JOB_BACKFILL_ENABLED === 'true'?
     false → log "disabled", return
  → splitIntoInitialWindows(from, to, 7)
  → per window: backfillQueue.add('backfill:window', { from, to },
      { jobId: `backfill:${from}:${to}` })
  → return (tidak nunggu)

Worker C handler:
  → iterateNossaClosedWindow(from, to)
    → client.ts fetch per page (backfill budget: 6/min)
    → processRawRows → upsert (per-incident lock + staleness guard)
```

### Weekly Safety Backfill (ops-worker, jadwal cron)

Job mingguan untuk memanfaatkan budget 6/min yang menganggur sebagai jaring pengaman. Rolling 30 hari, geser tiap minggu. Aman diulang karena staleness guard mencegah data baru tertimpa.

```
BRIDGE_JOB_WEEKLY_SAFETY_BACKFILL_ENABLED=false  # Aktifkan di Phase 4
BRIDGE_WEEKLY_BACKFILL_WINDOW_DAYS=30            # Rolling window ke belakang
BRIDGE_WEEKLY_BACKFILL_CRON='0 3 * * 0'          # Minggu 03:00 WIB
```

```typescript
// ops-worker, cron schedule
if (BRIDGE_JOB_WEEKLY_SAFETY_BACKFILL_ENABLED === 'true') {
  const weekMarker = format(new Date(), 'yyyy-ww');
  const since = subDays(new Date(), Number(BRIDGE_WEEKLY_BACKFILL_WINDOW_DAYS));
  const windows = splitIntoInitialWindows(since, new Date(), 7);
  for (const w of windows) {
    await backfillQueue.add('backfill:window', w, {
      jobId: `backfill:weekly:${weekMarker}:${w.from}:${w.to}`,  // unik per minggu
    });
  }
}
```

#### Batasan yang disadari

- Rolling 30 hari — **tidak menutup outage >30 hari**. Backfill manual dengan window lebih lebar tetap wajib setelah downtime panjang (migrasi server, dsb).
- Bukan pengganti one-off backfill pertama kali — backfill awal tetap manual via `npm run bridge:backfill`.
- Staleness guard menjamin aman diulang — data yang sudah terisi lebih baru dari scan ini tidak akan tertimpa.

## Redis Infra (aaPanel, via `redis-cli CONFIG SET`)

### Konfigurasi Final

| Setting | Sebelum | Sesudah | Alasan |
|---------|---------|---------|--------|
| `maxmemory` | 64mb | 256mb | BullMQ butuh ~50-100MB untuk job antrian |
| `maxmemory-policy` | `allkeys-lru` | `noeviction` | LRU bisa evict key BullMQ — job hilang |
| `appendonly` | no | yes | Job antrian data bisnis — harus survive restart |

### Eksekusi (tanpa restart — koneksi existing tidak terputus)

```bash
redis-cli -a <password> CONFIG SET maxmemory 268435456
redis-cli -a <password> CONFIG SET maxmemory-policy noeviction
redis-cli -a <password> CONFIG SET appendonly yes
redis-cli -a <password> CONFIG REWRITE
```

Pre-deploy checks:
```bash
redis-cli -a <password> CONFIG GET maxclients     # pastikan cukup +6 koneksi
redis-cli -a <password> INFO memory | grep used_memory_human  # pastikan jauh < 256mb
```

### Satu Ketergantungan Baru

Redis sekarang jadi tulang punggung untuk: cache, SSE pub/sub, distributed lock, rate limiter, + BullMQ (job persisten). Single point of failure yang lebih kritis dari sebelumnya. Minimal: backup RDB/AOF terjadwal + monitoring uptime Redis. Redis Sentinel/Cluster tidak diperlukan untuk skala saat ini.

## Prisma Connection Budget

| Proses | Connection Limit |
|--------|-----------------|
| dompis-server | 30 |
| dompis-ops-worker | 8 |
| dompis-data-worker | 15 |
| dompis-projection-worker | 6 |
| **dompis-bridge-worker** (NEW) | 6 |
| **Total** | **65** |

Cek MySQL `max_connections` sebelum deploy:
```sql
SHOW VARIABLES LIKE 'max_connections';
```

Total 65 harus di bawah `max_connections` — sisakan buffer minimal 20% untuk koneksi admin/tools.

## PM2 Config

Tambah entry baru di `ecosystem.config.js`:

```javascript
{
  name: 'dompis-bridge-worker',
  script: 'node',
  args: '-r ./dist-workers/register-paths.cjs dist-workers/worker-bridge.js',
  cwd: '/www/wwwroot/dompis_v2',
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: '512M',
  node_args: '--max-old-space-size=512',
  kill_timeout: 120000,   // lebih panjang dari default 30s — job ingest bisa 5-10 menit
  env: {
    NODE_ENV: 'production',
    REDIS_PORT: '6379',
    PRISMA_CONNECTION_LIMIT: '6',
    PRISMA_POOL_TIMEOUT: '30',
    // Bridge
    QOSMIC_BRIDGE_ENABLED: 'true',
    QOSMIC_BRIDGE_BASE_URL: 'https://qosmic.solusee.id/api/metabase-bridge',
    QOSMIC_BRIDGE_TOKEN: 'mbb_99d24c46d664c3d2d6f463c6ab5698eefced0328',
    QOSMIC_BRIDGE_RATE_LIMIT_PER_MIN: '14',
    QOSMIC_BRIDGE_BACKFILL_RATE_LIMIT_PER_MIN: '6',
    QOSMIC_BRIDGE_TIMEOUT_MS: '15000',
    QOSMIC_BRIDGE_RETRY_MAX: '4',
    // Feature flags — semua disabled saat pertama deploy
    BRIDGE_JOB_SEARCH_ENABLED: 'false',
    BRIDGE_JOB_REFRESH_ENABLED: 'false',
    BRIDGE_JOB_INGESTION_ENABLED: 'false',
    BRIDGE_JOB_BACKFILL_ENABLED: 'false',
    // Weekly safety backfill (ops-worker, cron)
    BRIDGE_JOB_WEEKLY_SAFETY_BACKFILL_ENABLED: 'false',
    BRIDGE_WEEKLY_BACKFILL_WINDOW_DAYS: '30',
    // BullMQ
    BULLMQ_CONCURRENCY: '3',
    // Circuit breaker
    BRIDGE_MAX_CONSECUTIVE_ERRORS: '5',
    BRIDGE_CIRCUIT_RESET_MINUTES: '10',
  },
}
```

`kill_timeout: 120000` — memberi job panjang (ingest 5-10 menit) kesempatan selesai graceful via `worker.close()` saat PM2 reload. Trade-off: kalau deploy di jam sibuk, job yang hampir selesai bisa diselesaikan, bukan diulang dari awal.

## DLQ Monitoring (ops-worker)

Tambahkan schedule di ops-worker (`lib/workers/worker.ts`) tiap 15 menit:

```typescript
import { interactiveQueue, ingestionQueue, backfillQueue } from '../external-db/qosmic-bridge/bridge-queue';

// Di schedule loop:
const [iFailed, ingFailed, bFailed] = await Promise.all([
  interactiveQueue.getJobCounts('failed'),
  ingestionQueue.getJobCounts('failed'),
  backfillQueue.getJobCounts('failed'),
]);
const totalFailed = iFailed + ingFailed + bFailed;
if (totalFailed > 10) {
  logger.error('Bridge DLQ threshold exceeded', { totalFailed, iFailed, ingFailed, bFailed });
  // Kirim alert (sudah ada pola sendCriticalAlert di codebase)
}
```

## MySQL Version Check

`VALUES()` deprecated sejak MySQL 8.0.20. Cek versi:

```sql
SHOW VARIABLES LIKE 'version';
```

- Jika ≥ 8.0.20: ganti `VALUES(x)` dengan `new.x` di `buildUpsertSetClause()` dan ubah `VALUES (...)` menjadi `VALUES (...) AS new ON DUPLICATE KEY UPDATE`. Logika sama, syntax berbeda.
- Jika < 8.0.20: syntax `VALUES(x)` tetap valid. Tidak ada perubahan.

## Phased Rollout

| Phase | Durasi | Aktivasi | Yang Dideploy | Monitoring |
|-------|--------|----------|---------------|------------|
| **0** | 1 hari | — | Redis infra: `CONFIG SET` maxmemory, noeviction, appendonly | Redis stabil, tidak OOM, koneksi existing tidak terputus |
| **1** | 1 hari | Semua `*_ENABLED=false` | BullMQ infra + `worker-bridge.ts` + `bridge-queue.ts` + PM2 entry. Worker jalan, queue siap, tapi semua job handler skip | Worker process up, koneksi Redis/Prisma OK, tidak ada error |
| **2** | 2 hari | `BRIDGE_JOB_SEARCH_ENABLED=true` | API search → interactive job + `waitUntilFinished` | Response time API, rate limit usage, error rate |
| **3** | 2 hari | `BRIDGE_JOB_REFRESH_ENABLED=true` | Status refresh → push refresh jobs | Queue depth, completion rate, DLQ, data freshness |
| **4** | 3 hari | `BRIDGE_JOB_INGESTION_ENABLED=true` + backfill | Ingestion + backfill via BullMQ | Full pipeline, rate limit adherence, data completeness |

## File Changes Final

### New Files

| File | Description |
|------|-------------|
| `lib/external-db/qosmic-bridge/bridge-queue.ts` | 3 queues definition, 3 Workers, job handlers, `buildUpsertSetClause()`, circuit breaker, per-incident lock, DLQ hooks |
| `worker-bridge.ts` | Entry point PM2: Prisma init, Worker.start(), graceful shutdown, correlation context |

### Modified Files

| File | Changes |
|------|---------|
| `package.json` | Add `bullmq` dependency |
| `ecosystem.config.js` | Add `dompis-bridge-worker` entry (512MB, `kill_timeout: 120000`, feature flags) |
| `lib/ingestion/index.ts` | Bridge branch: check `BRIDGE_JOB_INGESTION_ENABLED` → `ingestionQueue.add(...)` |
| `lib/status-refresh.ts` | Bridge branch: check `BRIDGE_JOB_REFRESH_ENABLED` → `interactiveQueue.addBulk(...)` with jobId |
| `app/api/nossa/search/route.ts` | Check `BRIDGE_JOB_SEARCH_ENABLED` → `interactiveQueue.add(...)` + `waitUntilFinished(5000)` |
| `scripts/qosmic-bridge-backfill.ts` | Check `BRIDGE_JOB_BACKFILL_ENABLED` → `backfillQueue.add(...)` per window with jobId |
| `lib/workers/worker.ts` | Add DLQ monitoring schedule (tiap 15 menit, cek `getJobCounts('failed')`) |

### No Changes (dipertahankan existing)

| File | Alasan |
|------|--------|
| `lib/external-db/qosmic-bridge/client.ts` | Redis rate limiter tetap jalan — satu-satunya gatekeeper HTTP |
| `lib/ratelimit.ts` | Tetap dipakai oleh `client.ts` — jangan dihapus |
| `lib/distributed-lock.ts` | Per-incident lock pake `redis.set` langsung — pattern sudah ada di codebase |
| `lib/external-db/qosmic-bridge/queue.ts` | Tidak dihapus — fallback safety |
| `lib/external-db/qosmic-bridge/status-refresh-adapter.ts` | Tidak dihapus — referensi logika |
| `lib/ingestion/normalizer.ts` | Tidak berubah — sudah diperbaiki di sesi sebelumnya (fix worklog_summary/last_update_worklog), tidak perlu perubahan tambahan |

## Ringkasan

| Layer | Mekanisme |
|-------|-----------|
| **Rate limit** | Redis sorted set di `client.ts` — satu gatekeeper, tidak ada ilusi lapisan ganda |
| **Queue isolation** | 3 BullMQ queues, 3 Workers dedicated — tidak ada race antar Worker |
| **Job persistence** | BullMQ via Redis — survive crash & restart, stall detection |
| **Priority** | P1 search > P5 refresh (dalam `bridge:interactive`) |
| **Dedup** | `jobId` statis: `ingest:nossa`, `backfill:${from}:${to}`, `refresh:${table}:${inc}` |
| **Write coordination** | Per-incident Redis lock (`SET NX PX 5000`) — mencegah write bersamaan |
| **Staleness guard** | `IF(VALUES(sourceUpdatedAt) >= sourceUpdatedAt, VALUES(col), col)` via `buildUpsertSetClause()` — 82 kolom, auto-generated, 0 extra SELECT |
| **Null safety** | `CASE WHEN` di SQL — NULL tidak pernah menimpa valid timestamp |
| **SQL injection** | Nama kolom via whitelist statis, nilai via Prisma `$executeRaw` parameter binding |
| **Circuit breaker** | Reuse `shouldRunWithCircuitBreaker` — 5 cons errors → open, 10 min → half-open |
| **Correlation ID** | `job.data.correlationId` diteruskan dari producer; `runWithCorrelationContext` di handler |
| **DLQ monitoring** | ops-worker tiap 15 menit — `getJobCounts('failed')` > 10 → alert |
| **Redis infra** | `maxmemory 256mb`, `noeviction`, `appendonly yes` — via aaPanel `CONFIG SET` |
| **Prisma budget** | Total 65 connections — verifikasi MySQL `max_connections` ≥ 80 |
| **Phased rollout** | 5 fase (0→4), tiap fase jeda observasi 1-3 hari, feature flag per job type |
